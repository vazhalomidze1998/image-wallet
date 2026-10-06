import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  quiet: true,
});

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  AWS_REGION: z.string().min(1),
  // Optional: when omitted, the AWS SDK default credential chain is used (e.g. IAM role).
  AWS_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  AWS_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  AWS_S3_BUCKET: z.string().min(3),
  // Set only for S3-compatible storage (local SeaweedFS). Leave empty for real AWS S3.
  AWS_S3_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  // Endpoint the browser uses for presigned URLs, if it differs from AWS_S3_ENDPOINT
  // (e.g. backend reaches "http://s3:8333" inside Docker, browser uses "http://localhost:8333").
  AWS_S3_PUBLIC_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  AWS_S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  S3_PRESIGNED_TTL: z.coerce.number().int().min(60).max(604800).default(900),

  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(50).default(10),

  WEBHOOK_SECRET: z.string().min(16, 'WEBHOOK_SECRET must be at least 16 characters'),

  // Twilio credentials for top-up confirmation codes. When any is empty, codes are only
  // logged to the console (and returned to the client outside production).
  TWILIO_ACCOUNT_SID: z.preprocess(emptyToUndefined, z.string().optional()),
  TWILIO_AUTH_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  TWILIO_FROM_NUMBER: z.preprocess(emptyToUndefined, z.string().optional()),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
