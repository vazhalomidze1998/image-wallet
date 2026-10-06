import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import type { Image, ImageVariant } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { S3_BUCKET } from '../config/s3';
import { NotFoundError, ValidationError } from '../utils/errors';
import { buildPagination, toSkipTake } from '../utils/pagination';
import * as s3 from './s3.service';

/** Sharp format name → stored mime type and file extension. */
export const IMAGE_FORMATS = {
  jpeg: { mimeType: 'image/jpeg', ext: 'jpg' },
  png: { mimeType: 'image/png', ext: 'png' },
  webp: { mimeType: 'image/webp', ext: 'webp' },
} as const;

export type ImageFormat = keyof typeof IMAGE_FORMATS;

// Guards against decompression bombs (tiny file, huge pixel count). 50 MP ≈ 8660 × 5773.
export const MAX_INPUT_PIXELS = 50_000_000;

export function isImageFormat(format: string | undefined): format is ImageFormat {
  return !!format && format in IMAGE_FORMATS;
}

export async function toImageDto(image: Image) {
  return {
    id: image.id,
    originalName: image.originalName,
    mimeType: image.mimeType,
    format: image.format,
    width: image.width,
    height: image.height,
    size: image.size,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    url: await s3.getPresignedUrl(image.s3Key),
    urlExpiresIn: env.S3_PRESIGNED_TTL,
  };
}

export async function toVariantDto(variant: ImageVariant) {
  return {
    id: variant.id,
    hash: variant.hash,
    transformations: variant.transformations,
    mimeType: variant.mimeType,
    format: variant.format,
    width: variant.width,
    height: variant.height,
    size: variant.size,
    createdAt: variant.createdAt,
    url: await s3.getPresignedUrl(variant.s3Key),
  };
}

function sanitizeFileName(name: string): string {
  // Strip any client-supplied directory parts and control characters.
  const base = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'image').slice(0, 255);
}

/** Reads real format/dimensions from the bytes; the client's mime type is not trusted. */
async function inspectImage(buffer: Buffer) {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ValidationError('File is not a valid image', undefined, 'INVALID_IMAGE');
  }

  if (!isImageFormat(metadata.format)) {
    throw new ValidationError('Only JPEG, PNG and WebP images are allowed', undefined, 'INVALID_FILE_TYPE');
  }
  if (!metadata.width || !metadata.height) {
    throw new ValidationError('Could not read image dimensions', undefined, 'INVALID_IMAGE');
  }
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new ValidationError('Image dimensions are too large', undefined, 'IMAGE_TOO_LARGE');
  }

  // Dimensions as displayed, i.e. after applying the EXIF orientation.
  const { width, height } = metadata.autoOrient ?? metadata;
  return { format: metadata.format, width, height };
}

export async function uploadImage(userId: string, file: Express.Multer.File | undefined) {
  if (!file) {
    throw new ValidationError('An image file is required in the "image" field', undefined, 'FILE_REQUIRED');
  }

  const { format, width, height } = await inspectImage(file.buffer);
  const { mimeType, ext } = IMAGE_FORMATS[format];

  const id = randomUUID();
  const s3Key = `originals/${userId}/${id}.${ext}`;

  await s3.uploadFile(s3Key, file.buffer, mimeType);

  try {
    const image = await prisma.image.create({
      data: {
        id,
        userId,
        originalName: sanitizeFileName(file.originalname),
        s3Key,
        bucket: S3_BUCKET,
        mimeType,
        format,
        width,
        height,
        size: file.size,
      },
    });
    return toImageDto(image);
  } catch (err) {
    // Do not leave an orphaned object in S3 if the metadata could not be saved.
    await s3.deleteObject(s3Key).catch(() => undefined);
    throw err;
  }
}

export async function listImages(userId: string, page: number, limit: number) {
  const where = { userId };
  const [images, total] = await prisma.$transaction([
    prisma.image.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(page, limit) }),
    prisma.image.count({ where }),
  ]);

  return {
    data: await Promise.all(images.map(toImageDto)),
    pagination: buildPagination(page, limit, total),
  };
}

/** Ownership check: another user's image is reported as not found. */
export async function findOwnedImage(userId: string, imageId: string) {
  const image = await prisma.image.findFirst({ where: { id: imageId, userId } });
  if (!image) throw new NotFoundError('Image not found', 'IMAGE_NOT_FOUND');
  return image;
}

export async function getImage(userId: string, imageId: string) {
  const image = await findOwnedImage(userId, imageId);
  const variants = await prisma.imageVariant.findMany({
    where: { imageId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    ...(await toImageDto(image)),
    variants: await Promise.all(variants.map(toVariantDto)),
  };
}

export async function deleteImage(userId: string, imageId: string) {
  const image = await findOwnedImage(userId, imageId);
  const variants = await prisma.imageVariant.findMany({ where: { imageId }, select: { s3Key: true } });

  // Storage first: S3 deletes are idempotent, so if the DB step fails the request can simply be retried.
  await s3.deleteObjects([image.s3Key, ...variants.map((v) => v.s3Key)]);
  // Variants are removed by ON DELETE CASCADE.
  await prisma.image.delete({ where: { id: image.id } });
}
