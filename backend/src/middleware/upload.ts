import multer from 'multer';
import { env } from '../config/env';
import { ValidationError } from '../utils/errors';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Keeps the file in memory (never on disk) so it can be validated with Sharp
 * and streamed to S3. The declared mime type is only a first filter; the real
 * format is verified from the file bytes in the image service.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  // Browsers send UTF-8 filenames (e.g. Georgian); the multer default is latin1.
  defParamCharset: 'utf8',
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
    fields: 5,
  },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Only JPEG, PNG and WebP images are allowed', undefined, 'INVALID_FILE_TYPE'));
    }
  },
}).single('image');
