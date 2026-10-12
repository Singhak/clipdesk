// Writes the extension's and desktop app's PNG icons (indigo rounded square with a white play mark) without extra dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function icon(size) {
  const ss = 4; // supersampling for smooth edges
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          // Portrait 9:16-ish rounded rectangle
          const hw = 0.36, hh = 0.47, r = 0.12;
          const dx = Math.max(Math.abs(u - 0.5) - (hw - r), 0);
          const dy = Math.max(Math.abs(v - 0.5) - (hh - r), 0);
          if (dx * dx + dy * dy <= r * r) {
            bg++;
            // Play triangle
            const px = u - 0.42, py = v - 0.5;
            if (px >= 0 && px <= 0.22 && Math.abs(py) <= 0.15 * (1 - px / 0.22)) fg++;
          }
        }
      const n = ss * ss;
      const a = bg / n, f = fg / n;
      const mix = (c1, c2) => Math.round(c1 * (1 - f / Math.max(a, 1e-6)) + c2 * (f / Math.max(a, 1e-6)));
      row.push(mix(79, 255), mix(70, 255), mix(229, 255), Math.round(a * 255));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const dir of ['../extension/public/icons/', '../electron/public/icons/']) {
  const outDir = new URL(dir, import.meta.url);
  mkdirSync(outDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`icon-${size}.png`, outDir), icon(size));
}
// Installer and app icon for electron-builder (it derives .ico / .icns from this)
const buildDir = new URL('../electron/build/', import.meta.url);
mkdirSync(buildDir, { recursive: true });
writeFileSync(new URL('icon.png', buildDir), icon(512));
console.log('icons written');
