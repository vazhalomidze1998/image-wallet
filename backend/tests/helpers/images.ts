import sharp from 'sharp';

/** Generates a real image in memory, so no binary fixtures are needed. */
export function makeImage(format: 'jpeg' | 'png' | 'webp' | 'gif', width = 64, height = 48) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .toFormat(format)
    .toBuffer();
}
