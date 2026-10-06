export type ImageFormat = 'jpeg' | 'png' | 'webp'

export interface Image {
  id: string
  originalName: string
  mimeType: string
  format: ImageFormat
  width: number
  height: number
  size: number
  createdAt: string
  updatedAt: string
  url: string
  urlExpiresIn: number
}

export interface ImageVariant {
  id: string
  hash: string
  transformations: Record<string, unknown>
  mimeType: string
  format: ImageFormat
  width: number
  height: number
  size: number
  createdAt: string
  url: string
}

export interface ImageDetails extends Image {
  variants: ImageVariant[]
}

export interface TransformResult extends ImageVariant {
  originalImageId: string
  cached: boolean
}

export const WATERMARK_POSITIONS = [
  'northwest',
  'north',
  'northeast',
  'west',
  'center',
  'east',
  'southwest',
  'south',
  'southeast',
] as const

export const RESIZE_FITS = ['cover', 'contain', 'fill', 'inside', 'outside'] as const

export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number]
export type ResizeFit = (typeof RESIZE_FITS)[number]

/** Request body shape of POST /images/:id/transform. */
export interface Transformations {
  resize?: { width?: number; height?: number; fit?: ResizeFit }
  crop?: { left: number; top: number; width: number; height: number }
  rotate?: number
  flip?: boolean
  flop?: boolean
  grayscale?: boolean
  sepia?: boolean
  watermark?: { text: string; position?: WatermarkPosition; opacity?: number }
  format?: ImageFormat
  quality?: number
  compress?: boolean
}
