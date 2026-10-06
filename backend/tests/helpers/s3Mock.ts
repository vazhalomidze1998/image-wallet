/**
 * In-memory replacement for src/services/s3.service used by tests:
 *   jest.mock('../src/services/s3.service', () => require('./helpers/s3Mock').s3Mock);
 */
import { NotFoundError } from '../../src/utils/errors';

export const storage = new Map<string, { body: Buffer; contentType: string }>();

export const s3Mock = {
  uploadFile: jest.fn(async (key: string, body: Buffer, contentType: string) => {
    storage.set(key, { body, contentType });
  }),
  getObject: jest.fn(async (key: string) => {
    const obj = storage.get(key);
    if (!obj) throw new NotFoundError('File not found in storage', 'FILE_NOT_FOUND');
    return obj.body;
  }),
  deleteObject: jest.fn(async (key: string) => {
    storage.delete(key);
  }),
  deleteObjects: jest.fn(async (keys: string[]) => {
    keys.forEach((k) => storage.delete(k));
  }),
  getPresignedUrl: jest.fn(async (key: string) => `https://s3.test/${key}?X-Amz-Signature=test`),
};
