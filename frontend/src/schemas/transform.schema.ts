import { z } from 'zod'
import { RESIZE_FITS, WATERMARK_POSITIONS, type ImageFormat, type Transformations } from '@/types/image'

const MAX_DIMENSION = 8000

/** Form keeps numbers as strings (empty = not set) and converts them in buildTransformations(). */
const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^-?\d+$/.test(v), `${label} must be a whole number`)
    .refine((v) => v === '' || (Number(v) >= min && Number(v) <= max), `${label} must be between ${min} and ${max}`)

export function makeTransformSchema(imageWidth: number, imageHeight: number) {
  return z
    .object({
      width: optionalInt(1, MAX_DIMENSION, 'Width'),
      height: optionalInt(1, MAX_DIMENSION, 'Height'),
      fit: z.enum(RESIZE_FITS),
      cropEnabled: z.boolean(),
      cropLeft: optionalInt(0, MAX_DIMENSION, 'Left'),
      cropTop: optionalInt(0, MAX_DIMENSION, 'Top'),
      cropWidth: optionalInt(1, MAX_DIMENSION, 'Width'),
      cropHeight: optionalInt(1, MAX_DIMENSION, 'Height'),
      rotate: optionalInt(-360, 360, 'Rotation'),
      flip: z.boolean(),
      mirror: z.boolean(),
      grayscale: z.boolean(),
      sepia: z.boolean(),
      format: z.enum(['', 'jpeg', 'png', 'webp']),
      quality: optionalInt(1, 100, 'Quality'),
      compress: z.boolean(),
      watermarkText: z.string().trim().max(100, 'At most 100 characters'),
      watermarkPosition: z.enum(WATERMARK_POSITIONS),
      watermarkOpacity: z.string(),
    })
    .superRefine((v, ctx) => {
      if (!v.cropEnabled) return
      const fields = ['cropLeft', 'cropTop', 'cropWidth', 'cropHeight'] as const
      for (const f of fields) {
        if (v[f] === '') ctx.addIssue({ code: 'custom', path: [f], message: 'Required for crop' })
      }
      if (fields.some((f) => v[f] === '')) return
      if (Number(v.cropLeft) + Number(v.cropWidth) > imageWidth) {
        ctx.addIssue({ code: 'custom', path: ['cropWidth'], message: `Left + width must be ≤ ${imageWidth}px` })
      }
      if (Number(v.cropTop) + Number(v.cropHeight) > imageHeight) {
        ctx.addIssue({ code: 'custom', path: ['cropHeight'], message: `Top + height must be ≤ ${imageHeight}px` })
      }
    })
}

export type TransformForm = z.infer<ReturnType<typeof makeTransformSchema>>

export const DEFAULT_TRANSFORM_FORM: TransformForm = {
  width: '',
  height: '',
  fit: 'cover',
  cropEnabled: false,
  cropLeft: '0',
  cropTop: '0',
  cropWidth: '',
  cropHeight: '',
  rotate: '0',
  flip: false,
  mirror: false,
  grayscale: false,
  sepia: false,
  format: '',
  quality: '80',
  compress: false,
  watermarkText: '',
  watermarkPosition: 'southeast',
  watermarkOpacity: '0.5',
}

/** Converts form values into the API body, leaving out everything that is not set. */
export function buildTransformations(v: TransformForm, originalFormat: ImageFormat): Transformations {
  const t: Transformations = {}
  const num = (s: string) => (s === '' ? undefined : Number(s))

  if (v.cropEnabled) {
    t.crop = { left: num(v.cropLeft)!, top: num(v.cropTop)!, width: num(v.cropWidth)!, height: num(v.cropHeight)! }
  }
  const width = num(v.width)
  const height = num(v.height)
  if (width || height) t.resize = { width, height, ...(width && height ? { fit: v.fit } : {}) }

  const rotate = num(v.rotate)
  if (rotate && rotate % 360 !== 0) t.rotate = rotate
  if (v.flip) t.flip = true
  if (v.mirror) t.flop = true
  if (v.grayscale) t.grayscale = true
  if (v.sepia) t.sepia = true
  if (v.watermarkText) {
    t.watermark = { text: v.watermarkText, position: v.watermarkPosition, opacity: Number(v.watermarkOpacity) }
  }

  if (v.format) t.format = v.format
  const outputFormat = v.format || originalFormat
  // PNG is lossless: quality only matters for JPEG/WebP.
  if (outputFormat !== 'png' && v.quality !== '' && v.quality !== '80') t.quality = Number(v.quality)
  if (v.compress) t.compress = true

  return t
}
