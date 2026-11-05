import * as dl from '../shared/downloads.js';

const $ = (sel) => document.querySelector(sel);
const shelfEl = $('#shelf');
const messageEl = $('#message');
const searchEl = $('#search');
const tabsEl = $('#tabs');
const netEl = $('#net');
const installBtn = $('#install');
const randomBtn = $('#random');
const toastEl = $('#toast');
const memoryBar = $('#memory-bar');
const memoryText = $('#memory-text');
const template = $('#cart');

const KIND_LABELS = { game: '게임', tool: '도구' };
const TONES = ['sky', 'lavender', 'mint', 'peach', 'butter', 'pink'];
const TAB_HOME = 'home';
const TAB_SHELF = 'shelf';
const MEMORY_SLOTS = 8;

// 10×10 픽셀 아이콘: [x, y, w, h]
const ICONS = {
  play: [[3, 1, 1, 8], [4, 2, 1, 6], [5, 3, 1, 4], [6, 4, 1, 2]],
  download: [[4, 0, 2, 5], [2, 4, 6, 1], [3, 5, 4, 1], [4, 6, 2, 1], [1, 8, 8, 2]],
  refresh: [[3, 1, 4, 1], [2, 2, 1, 1], [7, 2, 1, 1], [1, 3, 1, 4], [8, 3, 1, 2], [2, 7, 1, 1], [3, 8, 4, 1], [7, 7, 1, 1], [6, 4, 3, 1], [7, 5, 1, 1]],
  eject: [[4, 1, 2, 1], [3, 2, 4, 1], [2, 3, 6, 1], [1, 4, 8, 2], [1, 7, 8, 2]],
  check: [[1, 5, 2, 2], [3, 6, 2, 2], [5, 4, 2, 2], [7, 2, 2, 2]],
  search: [[2, 0, 4, 1], [1, 1, 1, 1], [6, 1, 1, 1], [0, 2, 1, 4], [7, 2, 1, 4], [1, 6, 1, 1], [6, 6, 1, 1], [2, 7, 4, 1], [7, 7, 1, 1], [8, 8, 2, 2]],
  dice: [[0, 0, 10, 1], [0, 9, 10, 1], [0, 1, 1, 8], [9, 1, 1, 8], [2, 2, 2, 2], [6, 6, 2, 2], [4, 4, 2, 2]],
};

function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const [x, y, w, h] of ICONS[name] ?? []) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h);
    svg.append(r);
  }
  return svg;
}

function fillIcons(root) {
  root.querySelectorAll('i[data-icon]').forEach((el) => el.replaceWith(icon(el.dataset.icon)));
}

/** @type {Array<any>} */
let items = [];
/** @type {Map<string,string>} 꽂아 둔 카트리지 id → 버전 */
let installed = new Map();
/** id → 진행률(0~1), 받는 중일 때만 */
const busy = new Map();
/** id → 카드 요소 */
const carts = new Map();
let tab = TAB_HOME;

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

function toneOf(item) {
  if (item.color && TONES.includes(item.color)) return item.color;
  let h = 0;
  for (const ch of item.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

function stateOf(item) {
  if (busy.has(item.id)) return 'busy';
  const v = installed.get(item.id);
  if (!v) return 'off';
  return v === item.version ? 'ok' : 'new';
}

function buildCart(item) {
  const el = template.content.firstElementChild.cloneNode(true);
  fillIcons(el);
  el.classList.add(`tone-${toneOf(item)}`);
  el.querySelectorAll('[data-play]').forEach((a) => { a.href = `games/${item.id}/`; });

  const img = el.querySelector('.cart__label img');
  if (item.thumbnail) {
    img.src = `games/${item.id}/${item.thumbnail}`;
    img.addEventListener('error', () => img.classList.add('is-broken'));
  } else {
    img.classList.add('is-broken');
  }

  el.querySelector('.kind').textContent = KIND_LABELS[item.kind] ?? '기타';
  el.querySelector('.cart__title').textContent = item.title;
  el.querySelector('.cart__desc').textContent = item.description;
  const tags = item.tags?.length ? ` · ${item.tags.join(' · ')}` : '';
  el.querySelector('.cart__meta').textContent = `${formatSize(item.size)}${tags}`;

  const gauge = el.querySelector('.gauge');
  for (let i = 0; i < 10; i++) gauge.append(document.createElement('i'));

  el.querySelector('[data-download]').addEventListener('click', () => onDownload(item));
  el.querySelector('[data-remove]').addEventListener('click', () => onRemove(item));
  return el;
}

function renderCart(item) {
  let el = carts.get(item.id);
  if (!el) {
    el = buildCart(item);
    carts.set(item.id, el);
  }
  const state = stateOf(item);
  const online = navigator.onLine;
  el.classList.toggle('cart--off', state === 'off');

  const stateEl = el.querySelector('.state');
  const pct = Math.round((busy.get(item.id) ?? 0) * 100);
  const states = {
    off: ['안 꽂힘', 'state--off', null],
    busy: [`꽂는 중 ${pct}%`, 'state--busy', null],
    ok: ['꽂힘', 'state--ok', 'check'],
    new: ['NEW!', 'state--new', null],
  };
  const [label, cls, ico] = states[state];
  stateEl.className = `state ${cls}`;
  stateEl.replaceChildren(...(ico ? [icon(ico)] : []), label);

  const gauge = el.querySelector('.gauge');
  gauge.hidden = state !== 'busy';
  if (state === 'busy') [...gauge.children].forEach((g, i) => g.classList.toggle('on', i < Math.round(pct / 10)));

  const downloadBtn = el.querySelector('[data-download]');
  downloadBtn.hidden = !dl.supported || state === 'ok';
  downloadBtn.disabled = state === 'busy' || !online;
  downloadBtn.classList.toggle('pbtn--yellow', state === 'new');
  downloadBtn.querySelector('.icon').replaceWith(icon(state === 'new' ? 'refresh' : 'download'));
  downloadBtn.querySelector('[data-label]').textContent = state === 'new' ? '업데이트' : state === 'busy' ? `${pct}%` : '꽂기';
  downloadBtn.title = state === 'new' ? '새 버전을 받아 둡니다' : '이 기기에 받아 두면 오프라인에서도 열려요';

  el.querySelector('[data-remove]').hidden = !(state === 'ok' || state === 'new');

  const playable = online || state === 'ok' || state === 'new';
  el.querySelectorAll('[data-play]').forEach((a) => {
    a.setAttribute('aria-disabled', String(!playable));
    if (a.classList.contains('pbtn')) a.tabIndex = playable ? 0 : -1;
  });
  return el;
}

function inTab(item) {
  if (tab === TAB_HOME) return true;
  if (tab === TAB_SHELF) return installed.has(item.id);
  return item.kind === tab;
}

function matches(item) {
  if (!inTab(item)) return false;
  const q = searchEl.value.trim().toLowerCase();
  return !q || [item.title, item.description, ...(item.tags ?? [])].some((s) => s.toLowerCase().includes(q));
}

function renderTabs() {
  const list = [
    { id: TAB_HOME, label: '홈' },
    ...Object.entries(KIND_LABELS).map(([id, label]) => ({ id, label, count: items.filter((i) => i.kind === id).length })),
    { id: TAB_SHELF, label: '보관함', count: installed.size },
  ];
  tabsEl.replaceChildren(...list.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.setAttribute('aria-pressed', String(t.id === tab));
    b.textContent = t.label;
    if (t.count != null) {
      const c = document.createElement('span');
      c.className = 'tab__count';
      c.textContent = t.count;
      b.append(c);
    }
    b.addEventListener('click', () => {
      tab = t.id;
      renderTabs();
      render();
    });
    return b;
  }));
}

function render() {
  const visible = items.filter(matches);
  shelfEl.replaceChildren(...visible.map(renderCart));

  let msg = '';
  if (!items.length) msg = '아직 선반이 비어 있어요. 곧 채워질 거예요.';
  else if (!visible.length && searchEl.value.trim()) msg = '찾는 카트리지가 없어요.';
  else if (!visible.length && tab === TAB_SHELF) msg = '보관함이 비어 있어요. 마음에 드는 카트리지를 꽂아 보세요.';
  else if (!visible.length) msg = `${KIND_LABELS[tab] ?? ''} 카트리지는 준비 중이에요.`;
  messageEl.textContent = msg;
  messageEl.hidden = !msg;
}

function renderNet() {
  const online = navigator.onLine;
  netEl.textContent = online ? '온라인' : '오프라인';
  netEl.className = `net${online ? '' : ' net--off'}`;
}

async function renderMemory() {
  const total = items.length || 1;
  const on = installed.size ? Math.max(1, Math.round((installed.size / total) * MEMORY_SLOTS)) : 0;
  memoryBar.replaceChildren(...Array.from({ length: MEMORY_SLOTS }, (_, i) => {
    const b = document.createElement('i');
    if (i < on) b.className = 'on';
    return b;
  }));
  const u = await dl.usage();
  memoryText.textContent = `${installed.size}/${items.length}${u?.used ? ` · ${formatSize(u.used)}` : ''}`;
}

let toastTimer = null;
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

async function refreshInstalled() {
  installed = await dl.listInstalled();
  renderTabs();
  render();
  renderMemory();
}

async function onDownload(item) {
  if (busy.has(item.id)) return;
  const wasUpdate = installed.has(item.id);
  busy.set(item.id, 0);
  renderCart(item);
  try {
    await dl.download(item.id, ({ ratio }) => {
      busy.set(item.id, ratio);
      renderCart(item);
    });
    toast(wasUpdate ? `「${item.title}」 업데이트 완료!` : `「${item.title}」 카트리지를 꽂았어요!`);
  } catch (err) {
    console.error(err);
    toast(`「${item.title}」을(를) 받지 못했어요. 잠시 뒤 다시 해 주세요.`);
  } finally {
    busy.delete(item.id);
    await refreshInstalled();
  }
}

async function onRemove(item) {
  if (!confirm(`「${item.title}」 카트리지를 뺄까요?\n받아 둔 파일만 지워지고, 세이브 데이터는 남아요.`)) return;
  await dl.remove(item.id);
  toast(`「${item.title}」 카트리지를 뺐어요.`);
  await refreshInstalled();
}

function playRandom() {
  const pool = navigator.onLine ? items : items.filter((i) => installed.has(i.id));
  if (!pool.length) {
    toast('지금 할 수 있는 카트리지가 없어요.');
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  location.href = `games/${pick.id}/`;
}

async function loadItems() {
  try {
    const res = await fetch('games.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    items = (await res.json()).games ?? [];
  } catch (err) {
    console.error(err);
    items = [];
    messageEl.textContent = '목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    messageEl.hidden = false;
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
randomBtn.addEventListener('click', playRandom);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('서비스 워커 등록 실패', err));
}

fillIcons(document);
renderNet();
loadItems();
