/**
 * Generates icon-192.png and icon-512.png with no npm dependencies.
 * Uses only Node.js built-ins: fs, zlib, path, url
 *
 * Run:  node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Minimal PNG encoder ─────────────────────────────────────────────────────

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, c]);
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: None
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon drawing ────────────────────────────────────────────────────────────

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const cr = size * 0.22; // corner radius for rounded-square shape

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - half, dy = y - half;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const edge = half - cr;

      // Rounded-square mask
      const inside =
        ax <= half && ay <= half &&
        (ax <= edge || ay <= edge ||
          Math.hypot(ax - edge, ay - edge) <= cr);

      if (!inside) { buf[i + 3] = 0; continue; }

      // Background: slate-950 #020617
      buf[i] = 2; buf[i + 1] = 6; buf[i + 2] = 23; buf[i + 3] = 255;

      const nx = dx / size, ny = dy / size; // normalised [-0.5, 0.5]

      // Camera body (slate-400 #94a3b8)
      if (nx > -0.27 && nx < 0.27 && ny > -0.03 && ny < 0.21) {
        buf[i] = 148; buf[i + 1] = 163; buf[i + 2] = 184;
      }
      // Viewfinder bump on top
      if (nx > -0.09 && nx < 0.09 && ny > -0.16 && ny < -0.03) {
        buf[i] = 148; buf[i + 1] = 163; buf[i + 2] = 184;
      }
      // Lens outer ring (slate-800 #1e293b)
      const ld = Math.hypot(dx, dy - size * 0.07);
      if (ld < size * 0.13) { buf[i] = 30; buf[i + 1] = 41; buf[i + 2] = 59; }
      // Lens inner (sky-400 #38bdf8)
      if (ld < size * 0.085) { buf[i] = 56; buf[i + 1] = 189; buf[i + 2] = 248; }
    }
  }

  return encodePNG(size, size, buf);
}

// ── Write files ─────────────────────────────────────────────────────────────

const outDir = join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon-192.png'), makeIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), makeIcon(512));
console.log('✓  public/icons/icon-192.png');
console.log('✓  public/icons/icon-512.png');
