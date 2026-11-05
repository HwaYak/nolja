// 놀자 개발 서버
// 빌드 → _site/ 를 http://localhost:8080 으로 서빙 → 파일이 바뀌면 다시 빌드한다.
// 사용법: node scripts/dev.mjs   (포트 변경: PORT=3000 node scripts/dev.mjs)

import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build, OUT, ROOT } from './build.mjs';

const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

await build();

let building = null;
let pending = false;
let timer = null;

async function rebuild() {
  if (building) { pending = true; return; }
  building = build({ quiet: true })
    .then(({ games }) => console.log(`[${new Date().toLocaleTimeString()}] 다시 빌드함 (게임 ${games.length}개)`))
    .catch((err) => console.error('빌드 실패:', err.message));
  await building;
  building = null;
  if (pending) { pending = false; rebuild(); }
}

watch(ROOT, { recursive: true }, (_event, file) => {
  if (!file) return;
  const top = file.split(/[\\/]/)[0];
  if (['_site', '.git', 'node_modules'].includes(top)) return;
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});

createServer(async (req, res) => {
  try {
    if (building) await building;
    const url = new URL(req.url, 'http://localhost');
    let file = path.normalize(path.join(OUT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      file = path.join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(PORT, () => {
  console.log(`놀자 개발 서버: http://localhost:${PORT}/  (파일 변경 시 자동 빌드, 종료: Ctrl+C)`);
});
