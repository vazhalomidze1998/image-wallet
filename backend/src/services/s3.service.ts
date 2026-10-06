import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { S3_BUCKET, s3Client, s3PresignClient } from '../config/s3';
import { AppError, NotFoundError } from '../utils/errors';

// S3 DeleteObjects accepts at most 1000 keys per request.
const DELETE_BATCH_SIZE = 1000;

function storageError(operation: string, err: unknown): AppError {
  console.error(`S3 ${operation} failed:`, err);
  return new AppError(502, 'STORAGE_ERROR', 'File storage is temporarily unavailable');
}

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
  } catch (err) {
    throw storageError('upload', err);
  }
}

export async function getObject(key: string): Promise<Buffer> {
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    if (!res.Body) throw new Error('Empty body');
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    if (err instanceof NoSuchKey) throw new NotFoundError('File not found in storage', 'FILE_NOT_FOUND');
    throw storageError('get', err);
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    // Deleting a missing key succeeds, so this is safe to retry.
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    throw storageError('delete', err);
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
    let errors: unknown[] | undefined;
    try {
      const res = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: S3_BUCKET,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      errors = res.Errors;
    } catch (err) {
      throw storageError('batch delete', err);
    }
    if (errors?.length) throw storageError('batch delete', errors);
  }
}

/** Time-limited GET URL; the bucket itself stays private. */
export async function getPresignedUrl(key: string, expiresIn = env.S3_PRESIGNED_TTL): Promise<string> {
  try {
    return await getSignedUrl(s3PresignClient, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), {
      expiresIn,
    });
  } catch (err) {
    throw storageError('presign', err);
  }
}
