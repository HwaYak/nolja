// 마스코트 도트 데이터(hub/mascot.js)로 앱 아이콘을 만든다.
// 사용법: node scripts/make-icons.mjs  → icons/ 아래 icon.svg, favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
// Node 내장 모듈만 사용 (PNG 는 zlib 으로 직접 인코딩).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BODY, HEAD, ICON_BG, PALETTE, toSvg } from '../hub/mascot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** rows 를 size×size PNG 로. 그림은 inner 크기로 가운데 배치(정수 배율), 나머지는 bg. */
function png(rows, size, inner = size) {
  const n = rows.length;
  const scale = Math.floor(inner / n);
  const off = Math.floor((size - n * scale) / 2);
  const bg = hex(ICON_BG);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - off) / scale);
      const gy = Math.floor((y - off) / scale);
      const ch = gx >= 0 && gy >= 0 && gx < n && gy < n ? rows[gy][gx] : '.';
      const [r, g, b] = ch === '.' ? bg : hex(PALETTE[ch]);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await writeFile(path.join(OUT, 'icon.svg'), toSvg(BODY, { bg: ICON_BG, title: '놀자' }) + '\n');
await writeFile(path.join(OUT, 'favicon.svg'), toSvg(HEAD, { bg: ICON_BG, title: '놀자' }) + '\n');
await writeFile(path.join(OUT, 'icon-192.png'), png(BODY, 192));
await writeFile(path.join(OUT, 'icon-512.png'), png(BODY, 512));
// 마스커블: 안드로이드가 가장자리를 잘라도 얼굴이 남도록 가운데 80% 안에 그린다.
await writeFile(path.join(OUT, 'icon-maskable-512.png'), png(BODY, 512, 400));
await writeFile(path.join(OUT, 'favicon-32.png'), png(HEAD, 32));
console.log('아이콘 생성 완료 → icons/');
