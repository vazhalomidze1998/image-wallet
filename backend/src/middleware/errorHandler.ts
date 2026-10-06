import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { env, isProduction } from '../config/env';
import { AppError, NotFoundError } from '../utils/errors';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
};

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError(409, 'CONFLICT', 'Resource already exists');
    if (err.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'Resource not found');
  }

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'FILE_TOO_LARGE', `File exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit`);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return new AppError(400, 'INVALID_FILE_FIELD', 'Send exactly one file in the "image" field');
    }
    return new AppError(400, 'UPLOAD_ERROR', err.message);
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return new AppError(400, 'INVALID_JSON', 'Request body contains invalid JSON');
  }

  // Body over express.json() size limit
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  return null;
}

// Express identifies error handlers by arity, so all four params must stay.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Failure in the middle of a streamed response (e.g. CSV export): a JSON error can
  // no longer be sent, so abort the connection and the client sees an incomplete download.
  if (res.headersSent) {
    console.error(err);
    res.destroy();
    return;
  }

  const appError = toAppError(err);

  if (!appError) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        ...(!isProduction && err instanceof Error ? { stack: err.stack } : {}),
      },
    });
    return;
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  });
};
