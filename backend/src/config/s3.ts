import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { env } from './env';

function buildConfig(endpoint: string | undefined): S3ClientConfig {
  return {
    region: env.AWS_REGION,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
    // Without explicit keys the SDK falls back to its default chain (env, profile, IAM role).
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  };
}

/** Client used for all S3 operations from the backend. */
export const s3Client = new S3Client(buildConfig(env.AWS_S3_ENDPOINT));

/**
 * Client used only to sign presigned URLs for the browser. Differs from s3Client
 * only when the browser reaches storage through another host (Docker networking).
 */
export const s3PresignClient = env.AWS_S3_PUBLIC_ENDPOINT
  ? new S3Client(buildConfig(env.AWS_S3_PUBLIC_ENDPOINT))
  : s3Client;

export const S3_BUCKET = env.AWS_S3_BUCKET;
