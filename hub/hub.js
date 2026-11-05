import * as dl from '../shared/downloads.js';

const $ = (sel) => document.querySelector(sel);
const listEl = $('#games');
const messageEl = $('#message');
const searchEl = $('#search');
const netEl = $('#net');
const storageEl = $('#storage');
const installBtn = $('#install');
const template = $('#card');

/** @type {Array<any>} */
let games = [];
/** @type {Map<string,string>} */
let installed = new Map();
/** id -> 진행률(0~1), 받는 중일 때만 */
const busy = new Map();
/** id -> HTMLElement */
const cards = new Map();

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = !text;
}

function stateOf(game) {
  if (busy.has(game.id)) return 'busy';
  const v = installed.get(game.id);
  if (!v) return 'none';
  return v === game.version ? 'ok' : 'update';
}

function renderCard(game) {
  let card = cards.get(game.id);
  if (!card) {
    card = template.content.firstElementChild.cloneNode(true);
    const href = `games/${game.id}/`;
    card.querySelectorAll('[data-play]').forEach((a) => { a.href = href; });
    const img = card.querySelector('.card__thumb img');
    if (game.thumbnail) {
      img.src = `games/${game.id}/${game.thumbnail}`;
      img.addEventListener('error', () => img.classList.add('is-broken'));
    } else {
      img.classList.add('is-broken');
    }
    card.querySelector('.card__title').textContent = game.title;
    card.querySelector('.card__desc').textContent = game.description;
    card.querySelector('[data-download]').addEventListener('click', () => onDownload(game));
    card.querySelector('[data-remove]').addEventListener('click', () => onRemove(game));
    cards.set(game.id, card);
  }

  const state = stateOf(game);
  const online = navigator.onLine;
  const badge = card.querySelector('.badge');
  const progress = card.querySelector('.progress');
  const downloadBtn = card.querySelector('[data-download]');
  const removeBtn = card.querySelector('[data-remove]');
  const playLinks = card.querySelectorAll('[data-play]');

  const labels = {
    none: ['', ''],
    busy: ['받는 중', 'badge--busy'],
    ok: ['받음', 'badge--ok'],
    update: ['업데이트 있음', 'badge--update'],
  };
  const [label, cls] = labels[state];
  badge.textContent = label;
  badge.className = `badge ${cls}`;
  badge.hidden = !label;

  const tags = game.tags?.length ? ` · ${game.tags.join(', ')}` : '';
  card.querySelector('.card__meta').textContent = `${formatSize(game.size)}${tags}`;

  progress.hidden = state !== 'busy';
  if (state === 'busy') progress.firstElementChild.style.width = `${Math.round(busy.get(game.id) * 100)}%`;

  downloadBtn.hidden = !dl.supported || state === 'ok';
  downloadBtn.textContent = state === 'update' ? '업데이트' : state === 'busy' ? '받는 중…' : '받기';
  downloadBtn.disabled = state === 'busy' || !online;

  removeBtn.hidden = !(state === 'ok' || state === 'update');

  const playable = online || state === 'ok' || state === 'update';
  playLinks.forEach((a) => {
    a.setAttribute('aria-disabled', String(!playable));
    a.tabIndex = playable ? 0 : -1;
  });
  return card;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const visible = games.filter((g) =>
    !q || [g.title, g.description, ...(g.tags ?? [])].some((s) => s.toLowerCase().includes(q)));

  listEl.replaceChildren(...visible.map(renderCard));

  if (!games.length) showMessage('아직 등록된 게임이 없어요. 곧 채워질 거예요!');
  else if (!visible.length) showMessage(`"${searchEl.value.trim()}"에 맞는 게임이 없어요.`);
  else showMessage('');
}

function renderStatus() {
  const online = navigator.onLine;
  netEl.textContent = online ? '온라인' : '오프라인 · 받아 둔 게임만 할 수 있어요';
  netEl.className = `pill ${online ? 'pill--ok' : 'pill--off'}`;
}

async function renderStorage() {
  const u = await dl.usage();
  if (!u || !installed.size) { storageEl.hidden = true; return; }
  storageEl.hidden = false;
  storageEl.textContent = `받아 둔 게임 ${installed.size}개 · 사용 중 ${formatSize(u.used)}`;
}

async function refreshInstalled() {
  installed = await dl.listInstalled();
  render();
  renderStorage();
}

async function onDownload(game) {
  if (busy.has(game.id)) return;
  busy.set(game.id, 0);
  renderCard(game);
  try {
    await dl.download(game.id, ({ ratio }) => {
      busy.set(game.id, ratio);
      renderCard(game);
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

window.addEventListener('online', () => { renderStatus(); render(); });
window.addEventListener('offline', () => { renderStatus(); render(); });
searchEl.addEventListener('input', render);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('서비스 워커 등록 실패', err));
}

renderStatus();
loadGames();
