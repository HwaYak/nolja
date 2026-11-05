// 놀자 다운로드 관리자
// 게임 파일을 Cache API 에 받아 두고(받기/업데이트), 지우고, 상태를 알려 준다.
// 캐시 이름: nolja-game-<id>@<version>, 마지막에 games/<id>/__complete 를 넣어 완료를 표시한다.
// 서비스 워커(sw.js)는 완료 표시가 있는 캐시만 사용한다.

const GAME_PREFIX = 'nolja-game-';
const COMPLETE_FILE = '__complete';
const CONCURRENCY = 4;

export const supported = 'caches' in window && 'serviceWorker' in navigator;

const base = () => new URL('./', document.baseURI);
const gameUrl = (id, file) => new URL(`games/${id}/${file}`, base());

/** 받아 둔 게임 목록: Map<id, version> */
export async function listInstalled() {
  const installed = new Map();
  if (!supported) return installed;
  for (const key of await caches.keys()) {
    if (!key.startsWith(GAME_PREFIX)) continue;
    const [id, version] = key.slice(GAME_PREFIX.length).split('@');
    if (!id || !version) continue;
    const cache = await caches.open(key);
    if (await cache.match(gameUrl(id, COMPLETE_FILE))) installed.set(id, version);
  }
  return installed;
}

/**
 * 게임을 받는다. 이미 다른 버전이 있으면 새 버전을 다 받은 뒤 이전 버전을 지운다.
 * 중간에 실패하면 새로 받던 캐시만 지우고 이전 버전은 그대로 둔다.
 * @param {string} id
 * @param {(p:{loaded:number,total:number,ratio:number})=>void} [onProgress]
 * @returns {Promise<string>} 받은 버전
 */
export async function download(id, onProgress = () => {}) {
  if (!supported) throw new Error('이 브라우저는 게임 받기를 지원하지 않아요.');
  requestPersist();

  const res = await fetch(gameUrl(id, 'files.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`파일 목록을 받지 못했어요 (${res.status})`);
  const manifest = await res.json();
  const { version, files } = manifest;
  const total = files.reduce((sum, f) => sum + f.size, 0) || 1;

  const cacheName = `${GAME_PREFIX}${id}@${version}`;
  await caches.delete(cacheName); // 이전에 끊긴 같은 버전이 있으면 처음부터
  const cache = await caches.open(cacheName);

  let loaded = 0;
  onProgress({ loaded, total, ratio: 0 });
  const queue = [...files];
  try {
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift();
        const url = gameUrl(id, file.path);
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`${file.path} 을(를) 받지 못했어요 (${r.status})`);
        await cache.put(url, r);
        loaded += file.size;
        onProgress({ loaded, total, ratio: Math.min(1, loaded / total) });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    await cache.put(
      gameUrl(id, COMPLETE_FILE),
      new Response(JSON.stringify({ id, version, at: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch (err) {
    await caches.delete(cacheName);
    throw err;
  }

  for (const key of await caches.keys()) {
    if (key.startsWith(`${GAME_PREFIX}${id}@`) && key !== cacheName) await caches.delete(key);
  }
  return version;
}

/** 받아 둔 게임을 지운다. */
export async function remove(id) {
  if (!supported) return;
  for (const key of await caches.keys()) {
    if (key.startsWith(`${GAME_PREFIX}${id}@`)) await caches.delete(key);
  }
}

/** 이 사이트가 쓰는 저장 공간 (바이트). 알 수 없으면 null */
export async function usage() {
  try {
    const { usage: used, quota } = await navigator.storage.estimate();
    return { used, quota };
  } catch {
    return null;
  }
}

let persistAsked = false;
/** 브라우저에 "저장한 게임을 함부로 지우지 말아 달라"고 요청한다. */
export async function requestPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* 지원하지 않으면 무시 */
  }
}
