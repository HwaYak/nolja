// 놀자 서비스 워커
// - 허브 셸(index, hub, shared, icons, manifest)을 설치할 때 미리 캐시한다.
// - games/<id>/... 요청은 사용자가 받아 둔 게임 캐시가 있으면 거기서, 없으면 네트워크에서 가져온다.
// - 그 밖의 요청은 네트워크 우선, 실패하면 캐시(오프라인)로 응답한다.
// 아래 두 값은 scripts/build.mjs 가 빌드할 때 채운다.

const BUILD_VERSION = '__BUILD_VERSION__';
const SHELL_FILES = /*__SHELL_FILES__*/[];

const SHELL_PREFIX = 'nolja-shell-';
const SHELL_CACHE = SHELL_PREFIX + BUILD_VERSION;
const GAME_PREFIX = 'nolja-game-';
const COMPLETE_FILE = '__complete';

const scopeUrl = () => new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES.map((f) => new Request(new URL(f, scopeUrl()), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(SHELL_PREFIX) && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = scopeUrl();
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  // 다운로드 관리자가 최신 파일을 받을 때는 캐시를 건너뛴다.
  if (req.cache === 'no-store' || req.cache === 'reload') return;

  const rel = url.pathname.slice(scope.pathname.length);
  const game = rel.match(/^games\/([a-z0-9-]+)\/(.*)$/);
  if (game && game[2] !== 'files.json') {
    event.respondWith(fromGameCache(req, game[1], game[2]));
  } else {
    event.respondWith(networkFirst(req));
  }
});

// 완료 표시가 있는 게임 캐시를 찾는다.
async function findGameCache(id) {
  const prefix = `${GAME_PREFIX}${id}@`;
  const marker = new URL(`games/${id}/${COMPLETE_FILE}`, scopeUrl());
  for (const key of await caches.keys()) {
    if (!key.startsWith(prefix)) continue;
    const cache = await caches.open(key);
    if (await cache.match(marker)) return cache;
  }
  return null;
}

async function fromGameCache(req, id, sub) {
  const cache = await findGameCache(id);
  if (cache) {
    const file = sub === '' || sub.endsWith('/') ? `${sub}index.html` : sub;
    const hit = await cache.match(new URL(`games/${id}/${file}`, scopeUrl()), { ignoreSearch: true });
    if (hit) return hit;
  }
  try {
    return await fetch(req);
  } catch {
    return offlineResponse(req);
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const index = await caches.match(new URL('index.html', scopeUrl()));
      if (index) return index;
    }
    return offlineResponse(req);
  }
}

function offlineResponse(req) {
  if (req.mode === 'navigate') {
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>오프라인</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 16px">
<h1>오프라인이에요</h1><p>이 게임은 아직 받아 두지 않았어요. 인터넷에 연결한 뒤 놀자에서 "받기"를 눌러 주세요.</p>
<p><a href="${new URL('./', scopeUrl()).href}">놀자로 돌아가기</a></p></body>`;
    return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}
