import * as dl from '../shared/downloads.js';

const $ = (sel) => document.querySelector(sel);
const listEl = $('#games');
const messageEl = $('#message');
const searchEl = $('#search');
const chipsEl = $('#chips');
const netEl = $('#net');
const installBtn = $('#install');
const template = $('#card');
const stat = {
  games: $('#stat-games'),
  installed: $('#stat-installed'),
  usage: $('#stat-usage'),
};

const TONES = ['sky', 'lavender', 'mint', 'peach', 'butter', 'pink'];
const FILTER_ALL = 'all';
const FILTER_INSTALLED = 'installed';

/** @type {Array<any>} */
let games = [];
/** @type {Map<string,string>} 받아 둔 게임 id → 버전 */
let installed = new Map();
/** id → 진행률(0~1), 받는 중일 때만 */
const busy = new Map();
/** id → 카드 요소 */
const cards = new Map();
let filter = FILTER_ALL;

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function toneOf(game) {
  if (game.color && TONES.includes(game.color)) return game.color;
  let h = 0;
  for (const ch of game.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

function stateOf(game) {
  if (busy.has(game.id)) return 'busy';
  const v = installed.get(game.id);
  if (!v) return 'none';
  return v === game.version ? 'ok' : 'update';
}

function featuredId() {
  if (filter !== FILTER_ALL || searchEl.value.trim()) return null;
  return (games.find((g) => g.featured) ?? games[0])?.id ?? null;
}

function buildCard(game) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.classList.add(`tone-${toneOf(game)}`);
  const href = `games/${game.id}/`;
  card.querySelectorAll('[data-play]').forEach((a) => { a.href = href; });

  const img = card.querySelector('.card__media img');
  if (game.thumbnail) {
    img.src = `games/${game.id}/${game.thumbnail}`;
    img.addEventListener('error', () => img.classList.add('is-broken'));
  } else {
    img.classList.add('is-broken');
  }

  card.querySelector('.card__title').textContent = game.title;
  card.querySelector('.card__desc').textContent = game.description;

  const meta = card.querySelector('.card__meta');
  for (const t of game.tags ?? []) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = t;
    meta.append(tag);
  }
  const size = document.createElement('span');
  size.className = 'size';
  size.textContent = formatSize(game.size);
  meta.append(size);

  card.querySelector('[data-download]').addEventListener('click', () => onDownload(game));
  card.querySelector('[data-remove]').addEventListener('click', () => onRemove(game));
  return card;
}

function renderCard(game, featured = false) {
  let card = cards.get(game.id);
  if (!card) {
    card = buildCard(game);
    cards.set(game.id, card);
  }
  card.classList.toggle('card--featured', featured);

  const state = stateOf(game);
  const online = navigator.onLine;

  const status = card.querySelector('.status');
  const labels = {
    none: ['', ''],
    busy: ['받는 중', 'status--busy'],
    ok: ['받음', 'status--ok'],
    update: ['업데이트 있음', 'status--update'],
  };
  const [label, cls] = labels[state];
  status.textContent = label;
  status.className = `status ${cls}`;
  status.hidden = !label;

  const progress = card.querySelector('.progress');
  progress.hidden = state !== 'busy';
  if (state === 'busy') progress.firstElementChild.style.width = `${Math.round(busy.get(game.id) * 100)}%`;

  const downloadBtn = card.querySelector('[data-download]');
  downloadBtn.hidden = !dl.supported || state === 'ok';
  downloadBtn.disabled = state === 'busy' || !online;
  downloadBtn.querySelector('[data-label]').textContent =
    state === 'busy' ? `${Math.round(busy.get(game.id) * 100)}%` : state === 'update' ? '업데이트' : '받기';

  card.querySelector('[data-remove]').hidden = !(state === 'ok' || state === 'update');

  const playable = online || state === 'ok' || state === 'update';
  card.querySelectorAll('[data-play]').forEach((a) => {
    a.setAttribute('aria-disabled', String(!playable));
    if (a.classList.contains('btn')) a.tabIndex = playable ? 0 : -1;
  });
  return card;
}

function matches(game) {
  if (filter === FILTER_INSTALLED && !installed.has(game.id)) return false;
  if (filter !== FILTER_ALL && filter !== FILTER_INSTALLED && !(game.tags ?? []).includes(filter)) return false;
  const q = searchEl.value.trim().toLowerCase();
  return !q || [game.title, game.description, ...(game.tags ?? [])].some((s) => s.toLowerCase().includes(q));
}

function renderChips() {
  const tags = [...new Set(games.flatMap((g) => g.tags ?? []))];
  const items = [
    { id: FILTER_ALL, label: '전체', count: games.length },
    { id: FILTER_INSTALLED, label: '받아 둔 게임', count: installed.size },
    ...tags.map((t) => ({ id: t, label: t })),
  ];
  if (!items.some((i) => i.id === filter)) filter = FILTER_ALL;

  chipsEl.replaceChildren(...items.map((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(item.id === filter));
    b.textContent = item.label;
    if (item.count != null) {
      const c = document.createElement('span');
      c.className = 'chip__count';
      c.textContent = item.count;
      b.append(c);
    }
    b.addEventListener('click', () => {
      filter = item.id;
      renderChips();
      render();
    });
    return b;
  }));
}

function render() {
  const visible = games.filter(matches);
  const fid = featuredId();
  if (fid) visible.sort((a, b) => (b.id === fid) - (a.id === fid));
  listEl.replaceChildren(...visible.map((g) => renderCard(g, g.id === fid)));

  if (!games.length) showMessage('아직 등록된 게임이 없어요. 곧 채워질 거예요.');
  else if (!visible.length && filter === FILTER_INSTALLED && !searchEl.value.trim()) showMessage('아직 받아 둔 게임이 없어요. 마음에 드는 게임에서 "받기"를 눌러 보세요.');
  else if (!visible.length) showMessage('조건에 맞는 게임이 없어요.');
  else showMessage('');
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = !text;
}

function renderNet() {
  const online = navigator.onLine;
  netEl.textContent = online ? '온라인' : '오프라인';
  netEl.className = `net${online ? '' : ' net--off'}`;
}

async function renderStats() {
  stat.games.textContent = games.length;
  stat.installed.textContent = installed.size;
  const u = await dl.usage();
  stat.usage.textContent = u ? formatSize(u.used) : '-';
}

async function refreshInstalled() {
  installed = await dl.listInstalled();
  renderChips();
  render();
  renderStats();
}

async function onDownload(game) {
  if (busy.has(game.id)) return;
  busy.set(game.id, 0);
  renderCard(game, featuredId() === game.id);
  try {
    await dl.download(game.id, ({ ratio }) => {
      busy.set(game.id, ratio);
      renderCard(game, featuredId() === game.id);
    });
  } catch (err) {
    console.error(err);
    alert(`"${game.title}"을(를) 받지 못했어요.\n${err.message}`);
  } finally {
    busy.delete(game.id);
    await refreshInstalled();
  }
}

async function onRemove(game) {
  if (!confirm(`받아 둔 "${game.title}"을(를) 지울까요?\n세이브 데이터는 지워지지 않아요.`)) return;
  await dl.remove(game.id);
  await refreshInstalled();
}

async function loadGames() {
  try {
    const res = await fetch('games.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    games = (await res.json()).games ?? [];
  } catch (err) {
    console.error(err);
    games = [];
    showMessage('게임 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    return;
  }
  await refreshInstalled();
}

// 앱 설치 버튼
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

window.addEventListener('online', () => { renderNet(); render(); });
window.addEventListener('offline', () => { renderNet(); render(); });
searchEl.addEventListener('input', render);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('서비스 워커 등록 실패', err));
}

renderNet();
loadGames();
