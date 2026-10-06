/** Short human-readable summary of a variant's stored (normalized) transformations. */
export function describeTransformations(t: Record<string, unknown>): string {
  const parts: string[] = []
  const crop = t.crop as { width: number; height: number } | undefined
  const resize = t.resize as { width?: number; height?: number; fit?: string } | undefined
  const watermark = t.watermark as { text: string } | undefined

  if (crop) parts.push(`crop ${crop.width}×${crop.height}`)
  if (resize) parts.push(`resize ${resize.width ?? 'auto'}×${resize.height ?? 'auto'}${resize.fit ? ` (${resize.fit})` : ''}`)
  if (t.rotate) parts.push(`rotate ${String(t.rotate)}°`)
  if (t.flip) parts.push('flip')
  if (t.flop) parts.push('mirror')
  if (t.grayscale) parts.push('grayscale')
  if (t.sepia) parts.push('sepia')
  if (watermark) parts.push(`watermark “${watermark.text}”`)
  if (t.quality) parts.push(`q${String(t.quality)}`)
  if (t.compress) parts.push('compressed')
  if (t.format) parts.push(`→ ${String(t.format).toUpperCase()}`)
  return parts.join(' · ')
}
