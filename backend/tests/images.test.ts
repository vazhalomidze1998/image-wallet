import request from 'supertest';
import { createApp } from '../src/app';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { makeImage } from './helpers/images';
import { s3Mock, storage } from './helpers/s3Mock';

jest.mock('../src/services/s3.service', () => require('./helpers/s3Mock').s3Mock);

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  storage.clear();
  alice = await createUser(app);
  bob = await createUser(app);
});
afterAll(() => prisma.$disconnect());

async function upload(user: TestUser, buffer: Buffer, filename = 'photo.jpg', contentType = 'image/jpeg') {
  return request(app)
    .post('/api/images')
    .set(user.auth)
    .attach('image', buffer, { filename, contentType });
}

describe('POST /api/images', () => {
  it.each([
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
  ] as const)('uploads a %s image, stores it in S3 and saves only metadata', async (format, mime, ext) => {
    const buffer = await makeImage(format, 120, 80);
    const res = await upload(alice, buffer, `photo.${ext}`, mime);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      originalName: `photo.${ext}`,
      mimeType: mime,
      format,
      width: 120,
      height: 80,
      size: buffer.length,
      url: expect.stringContaining('X-Amz-Signature'),
    });
    // Internal storage details are not exposed.
    expect(res.body.data.s3Key).toBeUndefined();

    const key = `originals/${alice.id}/${res.body.data.id}.${ext}`;
    expect(s3Mock.uploadFile).toHaveBeenCalledWith(key, expect.any(Buffer), mime);
    expect(storage.has(key)).toBe(true);

    const row = await prisma.image.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row).toMatchObject({ userId: alice.id, s3Key: key, bucket: 'test-bucket', size: buffer.length });
  });

  it('keeps UTF-8 (Georgian) file names intact', async () => {
    const res = await upload(alice, await makeImage('png'), 'სურათი.png', 'image/png');

    expect(res.status).toBe(201);
    expect(res.body.data.originalName).toBe('სურათი.png');
  });

  it('uses the real format from the bytes, not the declared mime type', async () => {
    const res = await upload(alice, await makeImage('png'), 'fake.jpg', 'image/jpeg');

    expect(res.status).toBe(201);
    expect(res.body.data.format).toBe('png');
    expect(res.body.data.mimeType).toBe('image/png');
  });

  it('rejects a request without a file', async () => {
    const res = await request(app).post('/api/images').set(alice.auth).field('foo', 'bar');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('rejects a disallowed mime type', async () => {
    const res = await upload(alice, await makeImage('gif'), 'anim.gif', 'image/gif');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(s3Mock.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects a GIF disguised as PNG', async () => {
    const res = await upload(alice, await makeImage('gif'), 'anim.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a non-image file disguised as an image', async () => {
    const res = await upload(alice, Buffer.from('definitely not an image'), 'evil.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
    expect(s3Mock.uploadFile).not.toHaveBeenCalled();
    expect(await prisma.image.count()).toBe(0);
  });

  it('rejects files over the size limit with 413', async () => {
    const tooBig = Buffer.alloc(10 * 1024 * 1024 + 1);
    const res = await upload(alice, tooBig, 'big.jpg', 'image/jpeg');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a file sent in the wrong field', async () => {
    const res = await request(app)
      .post('/api/images')
      .set(alice.auth)
      .attach('photo', await makeImage('png'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_FIELD');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/images')
      .attach('image', await makeImage('png'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('removes the S3 object if saving metadata fails', async () => {
    const spy = jest.spyOn(prisma.image, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await upload(alice, await makeImage('jpeg'));

    expect(res.status).toBe(500);
    expect(s3Mock.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.size).toBe(0);
    spy.mockRestore();
  });
});

describe('GET /api/images', () => {
  it('paginates the current user\'s images, newest first', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await upload(alice, await makeImage('jpeg'), `a${i}.jpg`);
      ids.push(res.body.data.id);
    }
    await upload(bob, await makeImage('jpeg'), 'bob.jpg');

    const page1 = await request(app).get('/api/images?page=1&limit=2').set(alice.auth);
    expect(page1.status).toBe(200);
    expect(page1.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(page1.body.data.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[1]]);

    const page2 = await request(app).get('/api/images?page=2&limit=2').set(alice.auth);
    expect(page2.body.data.map((i: { id: string }) => i.id)).toEqual([ids[0]]);
  });

  it('never returns other users\' images', async () => {
    await upload(bob, await makeImage('jpeg'), 'bob.jpg');

    const res = await request(app).get('/api/images').set(alice.auth);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it.each(['page=0', 'limit=0', 'limit=101', 'page=abc'])('rejects invalid pagination: %s', async (qs) => {
    const res = await request(app).get(`/api/images?${qs}`).set(alice.auth);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/images/:id', () => {
  it('returns metadata, a presigned URL and variants', async () => {
    const up = await upload(alice, await makeImage('png'), 'a.png', 'image/png');
    const res = await request(app).get(`/api/images/${up.body.data.id}`).set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: up.body.data.id,
      url: expect.stringContaining(`originals/${alice.id}/`),
      urlExpiresIn: 900,
      variants: [],
    });
  });

  it('returns 404 for another user\'s image', async () => {
    const up = await upload(bob, await makeImage('png'), 'b.png', 'image/png');
    const res = await request(app).get(`/api/images/${up.body.data.id}`).set(alice.auth);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/images/not-a-uuid').set(alice.auth);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/images/:id', () => {
  it('deletes the original, all variants from S3 and the DB records', async () => {
    const up = await upload(alice, await makeImage('jpeg'));
    const imageId = up.body.data.id as string;

    const variantKey = `transformed/${alice.id}/${imageId}/${'a'.repeat(64)}.webp`;
    storage.set(variantKey, { body: Buffer.from('x'), contentType: 'image/webp' });
    await prisma.imageVariant.create({
      data: {
        imageId,
        hash: 'a'.repeat(64),
        transformations: {},
        s3Key: variantKey,
        bucket: 'test-bucket',
        mimeType: 'image/webp',
        format: 'webp',
        width: 1,
        height: 1,
        size: 1,
      },
    });

    const res = await request(app).delete(`/api/images/${imageId}`).set(alice.auth);

    expect(res.status).toBe(204);
    expect(s3Mock.deleteObjects).toHaveBeenCalledWith([`originals/${alice.id}/${imageId}.jpg`, variantKey]);
    expect(storage.size).toBe(0);
    expect(await prisma.image.count()).toBe(0);
    expect(await prisma.imageVariant.count()).toBe(0);
  });

  it('does not let another user delete the image', async () => {
    const up = await upload(bob, await makeImage('jpeg'));
    const res = await request(app).delete(`/api/images/${up.body.data.id}`).set(alice.auth);

    expect(res.status).toBe(404);
    expect(s3Mock.deleteObjects).not.toHaveBeenCalled();
    expect(await prisma.image.count()).toBe(1);
  });

  it('keeps DB records if S3 deletion fails, so it can be retried', async () => {
    const up = await upload(alice, await makeImage('jpeg'));
    s3Mock.deleteObjects.mockRejectedValueOnce(new Error('s3 down'));

    const res = await request(app).delete(`/api/images/${up.body.data.id}`).set(alice.auth);

    expect(res.status).toBe(500);
    expect(await prisma.image.count()).toBe(1);
  });
});
