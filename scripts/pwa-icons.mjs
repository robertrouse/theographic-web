// Renders the install icons in apps/web/public/icons from icon.svg.
//
// Run by hand after editing the SVG (`node scripts/pwa-icons.mjs`); the
// PNGs are committed, the build does not run this. Uses `sharp`, which is
// already in node_modules as Astro's image service — it is not a declared
// dependency, so if it ever goes missing `rsvg-convert` does the same job:
//   rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
//
//   icon-192.png, icon-512.png   purpose "any"; the mark on the page background
//   maskable-512.png             purpose "maskable"; the mark scaled into the
//                                central 60% so Android's circle/squircle masks
//                                keep the whole chain (safe zone is the inner 80%)
//   apple-touch-icon.png         180px, the "any" drawing; iOS rounds the corners
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const dir = fileURLToPath(new URL('../apps/web/public/icons/', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const bg = /<rect width="100" height="100" fill="(#[0-9a-f]{6})"\/>/.exec(svg)?.[1] ?? '#fbfaf7';

// Same drawing, mark scaled to 60% about the centre, on the same background.
const maskable = svg
  .replace(/<rect width="100" height="100" fill="#[0-9a-f]{6}"\/>/, '')
  .replace(
    /(<\/defs>)/,
    `$1<rect width="100" height="100" fill="${bg}"/><g transform="translate(20 20) scale(0.6)">`,
  )
  .replace('</svg>', '</g></svg>');

const out = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', svg, 180],
];
for (const [name, source, size] of out) {
  const buf = await sharp(Buffer.from(source), { density: (72 * size) / 100 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  writeFileSync(`${dir}${name}`, buf);
  console.log(`${name.padEnd(22)} ${size}×${size}  ${buf.length} bytes`);
}
