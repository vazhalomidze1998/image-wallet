/**
 * Dev helper: creates the bucket on local S3-compatible storage if it does not exist.
 * Not needed for real AWS S3 (create the bucket in the console; the app's IAM user
 * intentionally has no s3:CreateBucket permission).
 */
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { S3_BUCKET, s3Client } from '../config/s3';

async function main() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`Bucket "${S3_BUCKET}" already exists.`);
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) throw err;
    await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`Bucket "${S3_BUCKET}" created.`);
  }
}

main().catch((err) => {
  console.error('Storage init failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
