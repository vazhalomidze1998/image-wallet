import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../utils/errors';

interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates and replaces req.body / req.query / req.params with the parsed
 * (coerced, trimmed, defaulted) values. Controllers can trust their shape.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: [key, ...issue.path.map(String)].join('.'),
          message: issue.message,
        }));
        throw new ValidationError('Validation failed', details);
      }

      // In Express 5 req.query is a getter, so it must be redefined rather than assigned.
      Object.defineProperty(req, key, { value: result.data, writable: true, enumerable: true });
    }
    next();
  };
}
