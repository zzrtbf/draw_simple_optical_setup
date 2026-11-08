/**
 * Rasterises assets/icon.svg into platform icon bundles:
 *   - assets/app.ico        classic 32-bit BMP entries (Windows)
 *   - assets/app.iconset/   16…1024 px PNGs, feed to `iconutil -c icns` (macOS)
 *
 *   node scripts/make-icon.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './browser-path.mjs';

const EDGE = findBrowser();
if (!EDGE) {
  console.error('No Chromium-based browser found — set EDGE_PATH or CHROME_PATH.');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
const outFile = path.join(root, 'assets', 'app.ico');
const PREVIEW = path.join(root, 'assets', 'icon-256.png');
const ICONSET = path.join(root, 'assets', 'app.iconset');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
/** macOS iconset wants 1x and 2x rasters up to 512@2x. */
const ICONSET_FILES = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });

function pngDataUrl(size) {
  return page.evaluate(
    async ({ svgText, px }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      c.getContext('2d').drawImage(img, 0, 0, px, px);
      return c.toDataURL('image/png').split(',')[1];
    },
    { svgText: svg, px: size },
  );
}

async function rasterize(size) {
  return page.evaluate(
    async ({ svgText, px }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      return Array.from(ctx.getImageData(0, 0, px, px).data);
    },
    { svgText: svg, px: size },
  );
}

/** One uncompressed 32-bit icon image: BITMAPINFOHEADER + XOR bitmap + AND mask. */
function dib(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(0, 20);
  header.writeInt32LE(0, 24);
  header.writeInt32LE(0, 28);
  header.writeUInt32LE(0, 32);
  header.writeUInt32LE(0, 36);

  const xor = Buffer.alloc(size * size * 4);
  for (let row = 0; row < size; row++) {
    const srcRow = size - 1 - row; // bottom-up
    for (let x = 0; x < size; x++) {
      const s = (srcRow * size + x) * 4;
      const d = (row * size + x) * 4;
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
    }
  }
  const andRow = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(andRow * size);
  return Buffer.concat([header, xor, and]);
}

const images = [];
for (const size of SIZES) {
  const pixels = await rasterize(size);
  images.push({ size, data: dib(size, pixels) });
  if (size === 256) {
    fs.writeFileSync(PREVIEW, Buffer.from(await pngDataUrl(256), 'base64'));
  }
}

/* macOS: .icns is built from a folder of named PNGs via `iconutil` */
fs.mkdirSync(ICONSET, { recursive: true });
for (const [size, name] of ICONSET_FILES) {
  fs.writeFileSync(path.join(ICONSET, name), Buffer.from(await pngDataUrl(size), 'base64'));
}
await browser.close();

const headerSize = 6 + images.length * 16;
let offset = headerSize;
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);

const entries = [];
for (const img of images) {
  const e = Buffer.alloc(16);
  e.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
  e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += img.data.length;
}

const ico = Buffer.concat([head, ...entries, ...images.map((i) => i.data)]);
fs.writeFileSync(outFile, ico);
console.log(
  `wrote ${path.relative(root, outFile)} (${ico.length} bytes, sizes ${SIZES.join('/')})`,
);
console.log(`wrote ${path.relative(root, ICONSET)}/ (${ICONSET_FILES.length} PNGs for iconutil)`);
if (process.platform !== 'darwin') {
  console.log('macOS .icns: run `iconutil -c icns assets/app.iconset -o assets/app.icns` on a Mac.');
}
