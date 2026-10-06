import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app';
import {
  hashTransformations,
  normalizeTransformations,
} from '../src/services/transform.service';
import { transformationsSchema } from '../src/schemas/transform.schema';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { makeImage } from './helpers/images';
import { s3Mock, storage } from './helpers/s3Mock';

jest.mock('../src/services/s3.service', () => require('./helpers/s3Mock').s3Mock);

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;
let bob: TestUser;

/** 100x60 image: top half red, bottom half blue. */
async function makeTwoToneImage() {
  const blueHalf = await sharp({
    create: { width: 100, height: 30, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: 100, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .composite([{ input: blueHalf, top: 30, left: 0 }])
    .png()
    .toBuffer();
}

async function uploadAs(user: TestUser, buffer: Buffer, filename = 'photo.png', contentType = 'image/png') {
  const res = await request(app)
    .post('/api/images')
    .set(user.auth)
    .attach('image', buffer, { filename, contentType });
  return res.body.data.id as string;
}

function transform(user: TestUser, imageId: string, transformations: unknown) {
  return request(app).post(`/api/images/${imageId}/transform`).set(user.auth).send({ transformations });
}

/** Reads the rendered variant back from the mocked S3. */
async function storedVariant(res: request.Response) {
  const key = [...storage.keys()].find((k) => k.startsWith('transformed/') && k.includes(res.body.data.hash));
  if (!key) throw new Error('variant not stored');
  const buffer = storage.get(key)!.body;
  return { key, buffer, meta: await sharp(buffer).metadata() };
}

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i]!, g: data[i + (info.channels >= 3 ? 1 : 0)]!, b: data[i + (info.channels >= 3 ? 2 : 0)]! };
}

beforeEach(async () => {
  await resetDatabase();
  storage.clear();
  alice = await createUser(app);
  bob = await createUser(app);
});
afterAll(() => prisma.$disconnect());

describe('normalizeTransformations / hash', () => {
  const parse = (t: unknown) => transformationsSchema.parse(t);
  const hashOf = (t: unknown, original = 'jpeg') => hashTransformations(normalizeTransformations(parse(t), original));

  it('ignores key order', () => {
    expect(hashOf({ rotate: 90, grayscale: true, resize: { width: 10, height: 20 } })).toBe(
      hashOf({ resize: { height: 20, width: 10 }, grayscale: true, rotate: 90 }),
    );
  });

  it('treats equivalent values as the same', () => {
    expect(hashOf({ rotate: -90 })).toBe(hashOf({ rotate: 270 }));
    expect(hashOf({ mirror: true })).toBe(hashOf({ flop: true }));
    expect(hashOf({ format: 'jpg' })).toBe(hashOf({ format: 'jpeg' }));
    expect(hashOf({ format: 'webp' })).toBe(hashOf({ format: 'webp', quality: 80 }));
    expect(hashOf({ resize: { width: 10, height: 10 } })).toBe(hashOf({ resize: { width: 10, height: 10, fit: 'cover' } }));
    expect(hashOf({ grayscale: true })).toBe(hashOf({ grayscale: true, flip: false }));
    expect(hashOf({ grayscale: true }, 'png')).toBe(hashOf({ grayscale: true, format: 'png' }, 'png'));
  });

  it('distinguishes different transformations', () => {
    expect(hashOf({ rotate: 90 })).not.toBe(hashOf({ rotate: 180 }));
    expect(hashOf({ format: 'webp', quality: 80 })).not.toBe(hashOf({ format: 'webp', quality: 81 }));
    expect(hashOf({ watermark: { text: 'A' } })).not.toBe(hashOf({ watermark: { text: 'B' } }));
  });

  it('produces a 64-char hex SHA-256', () => {
    expect(hashOf({ rotate: 90 })).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /api/images/:id/transform', () => {
  it('chains resize → rotate → grayscale → compress → WebP in one request', async () => {
    const id = await uploadAs(alice, await makeImage('jpeg', 800, 600), 'photo.jpg', 'image/jpeg');

    const res = await transform(alice, id, {
      resize: { width: 400, height: 300 },
      rotate: 90,
      grayscale: true,
      compress: true,
      format: 'webp',
      quality: 70,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      originalImageId: id,
      cached: false,
      format: 'webp',
      mimeType: 'image/webp',
      width: 300,
      height: 400,
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      url: expect.any(String),
    });

    const { key, meta } = await storedVariant(res);
    expect(key).toBe(`transformed/${alice.id}/${id}/${res.body.data.hash}.webp`);
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([300, 400]);
  });

  // Regression: in one Sharp pipeline, rotate + resize(cover/contain) gave 300x300 / 400x400.
  it.each([
    ['cover', [300, 400]],
    ['contain', [300, 400]],
    ['fill', [300, 400]],
    ['inside', [300, 400]],
  ] as const)('resizes before rotating with fit=%s', async (fit, expected) => {
    const id = await uploadAs(alice, await makeImage('jpeg', 800, 600), 'a.jpg', 'image/jpeg');
    const res = await transform(alice, id, { resize: { width: 400, height: 300, fit }, rotate: 90 });

    expect(res.status).toBe(201);
    expect([res.body.data.width, res.body.data.height]).toEqual(expected);
  });

  it('crops, then resizes, then rotates', async () => {
    const id = await uploadAs(alice, await makeImage('jpeg', 800, 600), 'a.jpg', 'image/jpeg');
    const res = await transform(alice, id, {
      crop: { left: 0, top: 0, width: 400, height: 400 },
      resize: { width: 200, height: 100 },
      rotate: 270,
    });

    expect([res.body.data.width, res.body.data.height]).toEqual([100, 200]);
  });

  it('returns the cached variant for the same (or equivalent) request without re-rendering', async () => {
    const id = await uploadAs(alice, await makeImage('png'));
    const first = await transform(alice, id, { rotate: 90, grayscale: true });
    const second = await transform(alice, id, { grayscale: true, rotate: -270 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(s3Mock.getObject).toHaveBeenCalledTimes(1);
    // Original upload + one variant.
    expect(s3Mock.uploadFile).toHaveBeenCalledTimes(2);
    expect(await prisma.imageVariant.count()).toBe(1);
  });

  it('handles concurrent identical requests with a single variant', async () => {
    const id = await uploadAs(alice, await makeImage('png'));
    const results = await Promise.all(Array.from({ length: 5 }, () => transform(alice, id, { flip: true })));

    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await prisma.imageVariant.count()).toBe(1);
  });

  it('crops to the requested region', async () => {
    const id = await uploadAs(alice, await makeTwoToneImage());
    const res = await transform(alice, id, { crop: { left: 10, top: 35, width: 50, height: 20 } });

    expect(res.status).toBe(201);
    const { buffer, meta } = await storedVariant(res);
    expect([meta.width, meta.height]).toEqual([50, 20]);
    // Region lies entirely in the blue half.
    expect(await pixel(buffer, 25, 10)).toMatchObject({ r: 0, b: 255 });
  });

  it('rejects a crop outside the image', async () => {
    const id = await uploadAs(alice, await makeTwoToneImage());
    const res = await transform(alice, id, { crop: { left: 80, top: 0, width: 50, height: 10 } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CROP');
  });

  it('flips vertically and mirrors horizontally', async () => {
    const id = await uploadAs(alice, await makeTwoToneImage());

    const flipped = await storedVariant(await transform(alice, id, { flip: true }));
    expect(await pixel(flipped.buffer, 50, 5)).toMatchObject({ r: 0, b: 255 }); // blue now on top

    const mirrored = await storedVariant(await transform(alice, id, { mirror: true }));
    expect(await pixel(mirrored.buffer, 50, 5)).toMatchObject({ r: 255, b: 0 }); // still red on top
  });

  it('applies grayscale and sepia', async () => {
    const id = await uploadAs(alice, await makeTwoToneImage());

    const gray = await storedVariant(await transform(alice, id, { grayscale: true }));
    const g = await pixel(gray.buffer, 50, 5);
    expect(g.r).toBe(g.g);
    expect(g.g).toBe(g.b);

    const sepia = await storedVariant(await transform(alice, id, { sepia: true }));
    const s = await pixel(sepia.buffer, 50, 5);
    expect(s.r).toBeGreaterThan(s.g);
    expect(s.g).toBeGreaterThan(s.b);
  });

  it('adds a text watermark without changing dimensions', async () => {
    const buffer = await makeImage('png', 400, 200);
    const id = await uploadAs(alice, buffer);

    const res = await transform(alice, id, {
      watermark: { text: 'Vazha Lomidze', position: 'southeast', opacity: 1 },
    });

    expect(res.status).toBe(201);
    const { buffer: out, meta } = await storedVariant(res);
    expect([meta.width, meta.height]).toEqual([400, 200]);

    // The bottom-right corner area changed; the top-left did not.
    const before = await pixel(buffer, 5, 5);
    expect(await pixel(out, 5, 5)).toEqual(before);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const { data: orig } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    let changed = 0;
    for (let y = 150; y < 200; y++) {
      for (let x = 200; x < 400; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] !== orig[(y * 400 + x) * 3]) changed++;
      }
    }
    expect(changed).toBeGreaterThan(100);
  });

  it('watermarks after resizing (overlay matches the final size)', async () => {
    const id = await uploadAs(alice, await makeImage('jpeg', 800, 600), 'a.jpg', 'image/jpeg');
    const res = await transform(alice, id, {
      resize: { width: 200 },
      watermark: { text: '<script>&"\'ვაჟა' },
      format: 'jpeg',
    });

    expect(res.status).toBe(201);
    expect([res.body.data.width, res.body.data.height]).toEqual([200, 150]);
  });

  it('converts PNG with transparency to JPEG on a white background', async () => {
    const transparent = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const id = await uploadAs(alice, transparent);

    const res = await transform(alice, id, { format: 'jpeg' });
    const { buffer, meta } = await storedVariant(res);

    expect(meta.format).toBe('jpeg');
    expect(await pixel(buffer, 10, 10)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('shows created variants in GET /api/images/:id', async () => {
    const id = await uploadAs(alice, await makeImage('png'));
    const t = await transform(alice, id, { rotate: 180 });

    const res = await request(app).get(`/api/images/${id}`).set(alice.auth);
    expect(res.body.data.variants).toHaveLength(1);
    expect(res.body.data.variants[0]).toMatchObject({
      id: t.body.data.id,
      transformations: expect.objectContaining({ rotate: 180, format: 'png' }),
    });
  });

  it('returns 404 for another user\'s image', async () => {
    const id = await uploadAs(bob, await makeImage('png'));
    const res = await transform(alice, id, { rotate: 90 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
  });

  it.each([
    ['empty transformations', {}],
    ['unknown option', { blur: 5 }],
    ['quality out of range', { quality: 101 }],
    ['unsupported format', { format: 'gif' }],
    ['non-integer rotation', { rotate: 12.5 }],
    ['rotation out of range', { rotate: 720 }],
    ['resize without dimensions', { resize: {} }],
    ['negative width', { resize: { width: -5 } }],
    ['huge width', { resize: { width: 100000 } }],
    ['negative crop', { crop: { left: -1, top: 0, width: 10, height: 10 } }],
    ['empty watermark', { watermark: { text: '   ' } }],
    ['bad watermark position', { watermark: { text: 'x', position: 'top' } }],
  ])('rejects %s with 400', async (_label, transformations) => {
    const id = await uploadAs(alice, await makeImage('png'));
    const res = await transform(alice, id, transformations);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an output that would be too large', async () => {
    const id = await uploadAs(alice, await makeImage('png'));
    const res = await transform(alice, id, { resize: { width: 8000, height: 8000 } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OUTPUT_TOO_LARGE');
  });
});
