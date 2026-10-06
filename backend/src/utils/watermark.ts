import type { WATERMARK_POSITIONS } from '../schemas/transform.schema';

type Position = (typeof WATERMARK_POSITIONS)[number];

export interface WatermarkOptions {
  text: string;
  position: Position;
  opacity: number;
  fontSize?: number;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds an SVG overlay exactly the size of the image with the text placed
 * at the requested position. Same-size overlay avoids Sharp's
 * "composite must be same size or smaller" error for any output size.
 */
export function buildWatermarkSvg(width: number, height: number, options: WatermarkOptions): Buffer {
  const fontSize = options.fontSize ?? Math.max(12, Math.round(Math.min(width, height) * 0.06));
  const padding = Math.round(fontSize * 0.75);
  const pos = options.position;

  let x = width / 2;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (pos.includes('west')) {
    x = padding;
    anchor = 'start';
  } else if (pos.includes('east')) {
    x = width - padding;
    anchor = 'end';
  }

  // y is the text baseline.
  let y = height / 2 + fontSize / 3;
  if (pos.startsWith('north')) y = padding + fontSize * 0.8;
  else if (pos.startsWith('south')) y = height - padding;

  const strokeWidth = Math.max(1, Math.round(fontSize / 16));

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${x}" y="${y}" text-anchor="${anchor}"
        font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="bold"
        fill="#ffffff" fill-opacity="${options.opacity}"
        stroke="#000000" stroke-opacity="${options.opacity * 0.6}" stroke-width="${strokeWidth}"
        paint-order="stroke">${escapeXml(options.text)}</text>
</svg>`;

  return Buffer.from(svg);
}
