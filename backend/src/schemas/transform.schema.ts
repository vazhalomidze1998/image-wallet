import { z } from 'zod';

const MAX_DIMENSION = 8000;

const dimension = z.number().int().min(1).max(MAX_DIMENSION);

export const WATERMARK_POSITIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'center',
] as const;

export const RESIZE_FITS = ['cover', 'contain', 'fill', 'inside', 'outside'] as const;

export const transformationsSchema = z
  .strictObject({
    resize: z
      .strictObject({
        width: dimension.optional(),
        height: dimension.optional(),
        fit: z.enum(RESIZE_FITS).optional(),
      })
      .refine((r) => r.width !== undefined || r.height !== undefined, {
        message: 'resize needs width and/or height',
      })
      .optional(),
    crop: z
      .strictObject({
        left: z.number().int().min(0),
        top: z.number().int().min(0),
        width: dimension,
        height: dimension,
      })
      .optional(),
    rotate: z.number().int().min(-360).max(360).optional(),
    flip: z.boolean().optional(),
    flop: z.boolean().optional(),
    /** Alias for flop (horizontal mirror). */
    mirror: z.boolean().optional(),
    grayscale: z.boolean().optional(),
    sepia: z.boolean().optional(),
    watermark: z
      .strictObject({
        text: z.string().trim().min(1).max(100),
        position: z.enum(WATERMARK_POSITIONS).optional(),
        opacity: z.number().min(0.1).max(1).optional(),
        fontSize: z.number().int().min(8).max(400).optional(),
      })
      .optional(),
    format: z.enum(['jpeg', 'jpg', 'png', 'webp']).optional(),
    quality: z.number().int().min(1).max(100).optional(),
    /** Stronger (slower) compression for the output format. */
    compress: z.boolean().optional(),
  })
  .refine((t) => Object.values(t).some((v) => v !== undefined), {
    message: 'At least one transformation is required',
  });

export const transformBodySchema = z.strictObject({
  transformations: transformationsSchema,
});

export type TransformationsInput = z.infer<typeof transformationsSchema>;
export type TransformBody = z.infer<typeof transformBodySchema>;
