import sharp from 'sharp';
import { Prisma, type Image } from '@prisma/client';
import { prisma } from '../config/prisma';
import { S3_BUCKET } from '../config/s3';
import type { RESIZE_FITS, TransformationsInput, WATERMARK_POSITIONS } from '../schemas/transform.schema';
import { canonicalJson, sha256 } from '../utils/canonicalHash';
import { AppError, ValidationError } from '../utils/errors';
import { buildWatermarkSvg } from '../utils/watermark';
import {
  IMAGE_FORMATS,
  MAX_INPUT_PIXELS,
  findOwnedImage,
  isImageFormat,
  toVariantDto,
  type ImageFormat,
} from './image.service';
import * as s3 from './s3.service';

/**
 * Bump when the rendering logic changes in a way that alters output,
 * so old cached variants are not reused for new requests.
 */
const PIPELINE_VERSION = 1;
const DEFAULT_QUALITY = 80;
const MAX_OUTPUT_PIXELS = 50_000_000;

// Classic sepia tone matrix and ITU-R BT.601 luminance matrix.
const SEPIA_MATRIX: Matrix3 = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];
const GRAYSCALE_MATRIX: Matrix3 = [
  [0.299, 0.587, 0.114],
  [0.299, 0.587, 0.114],
  [0.299, 0.587, 0.114],
];

type Matrix3 = [[number, number, number], [number, number, number], [number, number, number]];

export interface NormalizedTransformations {
  v: number;
  crop?: { left: number; top: number; width: number; height: number };
  resize?: { width?: number; height?: number; fit?: (typeof RESIZE_FITS)[number] };
  rotate?: number;
  flip?: true;
  flop?: true;
  grayscale?: true;
  sepia?: true;
  watermark?: {
    text: string;
    position: (typeof WATERMARK_POSITIONS)[number];
    opacity: number;
    fontSize?: number;
  };
  format: ImageFormat;
  quality?: number;
  compress?: true;
}

/**
 * Produces one canonical representation per visual result, so that requests
 * that differ only cosmetically (key order, "mirror" vs "flop", -90 vs 270,
 * omitted defaults) share one cache entry.
 */
export function normalizeTransformations(
  input: TransformationsInput,
  originalFormat: string,
): NormalizedTransformations {
  const format: ImageFormat =
    input.format === 'jpg' ? 'jpeg' : (input.format ?? (isImageFormat(originalFormat) ? originalFormat : 'jpeg'));

  const rotate = input.rotate === undefined ? 0 : ((input.rotate % 360) + 360) % 360;

  let resize: NormalizedTransformations['resize'];
  if (input.resize) {
    const { width, height } = input.resize;
    // With a single dimension the aspect ratio is kept and "fit" has no effect.
    resize = width && height ? { width, height, fit: input.resize.fit ?? 'cover' } : { width, height };
  }

  // PNG quality only applies with palette quantization, so it has no default.
  const quality = format === 'png' ? input.quality : (input.quality ?? DEFAULT_QUALITY);

  return {
    v: PIPELINE_VERSION,
    crop: input.crop,
    resize,
    rotate: rotate === 0 ? undefined : rotate,
    flip: input.flip ? true : undefined,
    flop: input.flop || input.mirror ? true : undefined,
    grayscale: input.grayscale ? true : undefined,
    sepia: input.sepia ? true : undefined,
    watermark: input.watermark
      ? {
          text: input.watermark.text,
          position: input.watermark.position ?? 'southeast',
          opacity: input.watermark.opacity ?? 0.5,
          fontSize: input.watermark.fontSize,
        }
      : undefined,
    format,
    quality,
    compress: input.compress ? true : undefined,
  };
}

export function hashTransformations(normalized: NormalizedTransformations): string {
  return sha256(canonicalJson(normalized));
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const row = (i: 0 | 1 | 2) =>
    [0, 1, 2].map((j) => a[i][0] * b[0][j]! + a[i][1] * b[1][j]! + a[i][2] * b[2][j]!) as [
      number,
      number,
      number,
    ];
  return [row(0), row(1), row(2)];
}

/** Rejects requests that would be impossible or too expensive before touching S3 or Sharp. */
function assertFeasible(t: NormalizedTransformations, image: Image) {
  let width = image.width;
  let height = image.height;

  if (t.crop) {
    const { left, top, width: cw, height: ch } = t.crop;
    if (left + cw > image.width || top + ch > image.height) {
      throw new ValidationError(
        `Crop area exceeds image bounds (${image.width}x${image.height})`,
        undefined,
        'INVALID_CROP',
      );
    }
    width = cw;
    height = ch;
  }

  if (t.resize) {
    const { width: rw, height: rh, fit } = t.resize;
    if (rw && rh) {
      // "outside" may exceed one of the requested sides; take the worst case.
      const side = Math.max(rw, rh);
      [width, height] = fit === 'outside' ? [side, side] : [rw, rh];
    } else if (rw) {
      [width, height] = [rw, Math.round((height * rw) / width)];
    } else if (rh) {
      [width, height] = [Math.round((width * rh) / height), rh];
    }
  }

  // Arbitrary angles enlarge the canvas to the rotated bounding box.
  const pixels = t.rotate && t.rotate % 90 !== 0 ? (width + height) ** 2 / 2 : width * height;
  if (pixels > MAX_OUTPUT_PIXELS) {
    throw new ValidationError('Resulting image would be too large', undefined, 'OUTPUT_TOO_LARGE');
  }
}

function encode(img: sharp.Sharp, t: NormalizedTransformations): sharp.Sharp {
  switch (t.format) {
    case 'jpeg':
      return img.jpeg({ quality: t.quality, mozjpeg: !!t.compress });
    case 'webp':
      return img.webp({ quality: t.quality, effort: t.compress ? 6 : 4 });
    case 'png':
      return img.png({
        compressionLevel: t.compress ? 9 : 6,
        ...(t.quality !== undefined ? { palette: true, quality: t.quality } : {}),
      });
  }
}

/** Materializes the pipeline so far as raw pixels in memory and starts a new one from them. */
async function checkpoint(img: sharp.Sharp): Promise<sharp.Sharp> {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/**
 * Renders the variant entirely in memory (no temporary files), in the fixed order
 * crop → resize → rotate → flip → flop → grayscale/sepia → watermark → encode.
 *
 * Usually a single Sharp pipeline. Extra in-memory passes are used only when needed:
 * - rotate after crop/resize: Sharp applies rotation before resize internally, which
 *   gives wrong sizes with fit "cover"/"contain" (e.g. 400x300 + 90° → 300x300);
 * - watermark: the text overlay must match the final size, known only after rendering.
 */
export async function renderVariant(input: Buffer, t: NormalizedTransformations) {
  const opaque = t.format === 'jpeg';
  const background = opaque ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 };

  let img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).autoOrient();

  if (t.crop) img = img.extract(t.crop);
  if (t.resize) img = img.resize({ ...t.resize, background });
  if (t.rotate) {
    if (t.crop || t.resize) img = await checkpoint(img);
    img = img.rotate(t.rotate, { background });
  }
  if (t.flip) img = img.flip();
  if (t.flop) img = img.flop();

  if (t.sepia) {
    // Sepia on top of grayscale is one combined colour matrix.
    img = img.recomb(t.grayscale ? multiply(SEPIA_MATRIX, GRAYSCALE_MATRIX) : SEPIA_MATRIX);
  } else if (t.grayscale) {
    img = img.grayscale();
  }

  // JPEG has no alpha channel: blend transparency onto white instead of black.
  if (opaque) img = img.flatten({ background: '#ffffff' });

  if (t.watermark) {
    img = await checkpoint(img);
    const { width, height } = await img.metadata();
    img = img.composite([{ input: buildWatermarkSvg(width, height, t.watermark), top: 0, left: 0 }]);
    if (opaque) img = img.flatten({ background: '#ffffff' });
  }

  return encode(img, t).toBuffer({ resolveWithObject: true });
}

export async function transformImage(userId: string, imageId: string, input: TransformationsInput) {
  const image = await findOwnedImage(userId, imageId);

  const normalized = normalizeTransformations(input, image.format);
  assertFeasible(normalized, image);
  const hash = hashTransformations(normalized);

  // 1. Cache lookup.
  const existing = await prisma.imageVariant.findUnique({ where: { imageId_hash: { imageId, hash } } });
  if (existing) return { ...(await toVariantDto(existing)), originalImageId: imageId, cached: true };

  // 2. Render.
  const original = await s3.getObject(image.s3Key);
  let output: Awaited<ReturnType<typeof renderVariant>>;
  try {
    output = await renderVariant(original, normalized);
  } catch (err) {
    console.error('Transformation failed:', err);
    throw new AppError(422, 'TRANSFORMATION_FAILED', 'The image could not be transformed with these options');
  }

  // 3. Store. The key is derived from the hash, so concurrent identical requests write the same object.
  const { mimeType, ext } = IMAGE_FORMATS[normalized.format];
  const s3Key = `transformed/${userId}/${imageId}/${hash}.${ext}`;
  await s3.uploadFile(s3Key, output.data, mimeType);

  try {
    const variant = await prisma.imageVariant.create({
      data: {
        imageId,
        hash,
        transformations: normalized as unknown as Prisma.InputJsonObject,
        s3Key,
        bucket: S3_BUCKET,
        mimeType,
        format: normalized.format,
        width: output.info.width,
        height: output.info.height,
        size: output.info.size,
      },
    });
    return { ...(await toVariantDto(variant)), originalImageId: imageId, cached: false };
  } catch (err) {
    // A concurrent identical request inserted the row first: reuse it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const variant = await prisma.imageVariant.findUniqueOrThrow({ where: { imageId_hash: { imageId, hash } } });
      return { ...(await toVariantDto(variant)), originalImageId: imageId, cached: true };
    }
    throw err;
  }
}
