// 놀자 빌드 스크립트
// - 사이트 파일을 _site/ 로 복사한다.
// - games/<id>/meta.json 을 모아 _site/games.json 을 만든다.
// - 게임마다 파일 목록·용량·버전(내용 해시)을 계산해 _site/games/<id>/files.json 을 만든다.
// - sw.js 에 셸 파일 목록과 빌드 버전을 넣는다.
// Node 내장 모듈만 사용한다.

import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, '_site');

// 루트에서 _site 로 복사하지 않을 항목
const EXCLUDE_TOP = new Set([
  '.git', '.github', '.gitignore', '.claude', '.vscode', '.idea',
  '_site', 'node_modules', 'scripts', 'README.md',
]);

// 서비스 워커가 설치될 때 미리 캐시할 허브 셸
const SHELL_ENTRIES = ['index.html', 'manifest.webmanifest', 'hub', 'shared', 'icons'];

// 게임 폴더 안에서 다운로드 목록에 넣지 않을 파일
const GAME_EXCLUDE = new Set(['meta.json', 'files.json']);

const GAME_ID = /^[a-z0-9][a-z0-9-]*$/;

// 허브 카드에 쓸 수 있는 파스텔 색 (hub/hub.css 의 .tone-* 와 맞춘다)
const COLORS = new Set(['sky', 'lavender', 'mint', 'peach', 'butter', 'pink']);

// 카트리지 종류 (hub/hub.js 의 KIND_LABELS 와 맞춘다)
const KINDS = new Set(['game', 'tool']);

const toPosix = (p) => p.split(path.sep).join('/');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (entry.isFile()) out.push(toPosix(path.relative(base, full)));
  }
  return out.sort();
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function copySite() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (EXCLUDE_TOP.has(entry.name)) continue;
    await cp(path.join(ROOT, entry.name), path.join(OUT, entry.name), { recursive: true });
  }
}

async function buildGame(id) {
  const dir = path.join(ROOT, 'games', id);
  let meta;
  try {
    meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'));
  } catch (err) {
    console.warn(`  ! games/${id}: meta.json 을 읽을 수 없어 건너뜁니다 (${err.message})`);
    return null;
  }
  if (!meta.title) {
    console.warn(`  ! games/${id}: meta.json 에 title 이 없어 건너뜁니다`);
    return null;
  }

  const paths = (await walk(dir)).filter((p) => !GAME_EXCLUDE.has(p));
  if (!paths.includes('index.html')) {
    console.warn(`  ! games/${id}: index.html 이 없어 건너뜁니다`);
    return null;
  }

  const hash = createHash('sha256');
  const files = [];
  let size = 0;
  for (const p of paths) {
    const buf = await readFile(path.join(dir, p));
    hash.update(p).update('\0').update(buf).update('\0');
    files.push({ path: p, size: buf.length });
    size += buf.length;
  }
  const version = hash.digest('hex').slice(0, 12);

  await writeFile(
    path.join(OUT, 'games', id, 'files.json'),
    JSON.stringify({ id, version, size, files }, null, 2),
  );

  return {
    id,
    kind: KINDS.has(meta.kind) ? meta.kind : 'game',
    title: String(meta.title),
    description: String(meta.description ?? ''),
    thumbnail: meta.thumbnail ? String(meta.thumbnail) : null,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    color: COLORS.has(meta.color) ? meta.color : null,
    featured: meta.featured === true,
    order: Number.isFinite(meta.order) ? meta.order : 1000,
    version,
    size,
    fileCount: files.length,
  };
}

async function buildGames() {
  const gamesDir = path.join(ROOT, 'games');
  const games = [];
  if (await exists(gamesDir)) {
    for (const entry of await readdir(gamesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      if (!GAME_ID.test(entry.name)) {
        console.warn(`  ! games/${entry.name}: 폴더 이름은 영어 소문자, 숫자, - 만 쓸 수 있어 건너뜁니다`);
        continue;
      }
      const game = await buildGame(entry.name);
      if (game) games.push(game);
    }
  }
  games.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ko'));
  await writeFile(
    path.join(OUT, 'games.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), games }, null, 2),
  );
  return games;
}

async function buildServiceWorker() {
  const shell = ['./'];
  const hash = createHash('sha256');
  for (const entry of SHELL_ENTRIES) {
    const full = path.join(OUT, entry);
    if (!(await exists(full))) continue;
    const list = (await stat(full)).isDirectory()
      ? (await walk(full)).map((p) => `${entry}/${p}`)
      : [entry];
    for (const p of list) {
      shell.push(p);
      hash.update(p).update('\0').update(await readFile(path.join(OUT, p))).update('\0');
    }
  }
  const swPath = path.join(OUT, 'sw.js');
  let sw = await readFile(swPath, 'utf8');
  hash.update(sw);
  const version = hash.digest('hex').slice(0, 12);
  sw = sw
    .replace("'__BUILD_VERSION__'", JSON.stringify(version))
    .replace('/*__SHELL_FILES__*/[]', JSON.stringify(shell));
  await writeFile(swPath, sw);
  return version;
}

export async function build({ quiet = false } = {}) {
  const started = Date.now();
  await copySite();
  const games = await buildGames();
  const swVersion = await buildServiceWorker();
  if (!quiet) {
    console.log(`빌드 완료 (${Date.now() - started}ms) → _site/`);
    console.log(`  셸 버전 ${swVersion}, 게임 ${games.length}개`);
    for (const g of games) {
      console.log(`  - ${g.id} "${g.title}" v${g.version}, ${g.fileCount}개 파일, ${(g.size / 1024).toFixed(1)} KB`);
    }
  }
  return { games, swVersion };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
