import * as dl from '../shared/downloads.js';
import * as rec from '../shared/records.js';
import { BODY, blinkRows, toSvg } from './mascot.js';

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
const TAB_RECORDS = 'records';
const MEMORY_SLOTS = 8;
const GUEST = '손님';

// 10×10 픽셀 아이콘: [x, y, w, h]
const ICONS = {
  play: [[3, 1, 1, 8], [4, 2, 1, 6], [5, 3, 1, 4], [6, 4, 1, 2]],
  download: [[4, 0, 2, 5], [2, 4, 6, 1], [3, 5, 4, 1], [4, 6, 2, 1], [1, 8, 8, 2]],
  refresh: [[3, 1, 4, 1], [2, 2, 1, 1], [7, 2, 1, 1], [1, 3, 1, 4], [8, 3, 1, 2], [2, 7, 1, 1], [3, 8, 4, 1], [7, 7, 1, 1], [6, 4, 3, 1], [7, 5, 1, 1]],
  eject: [[4, 1, 2, 1], [3, 2, 4, 1], [2, 3, 6, 1], [1, 4, 8, 2], [1, 7, 8, 2]],
  check: [[1, 5, 2, 2], [3, 6, 2, 2], [5, 4, 2, 2], [7, 2, 2, 2]],
  search: [[2, 0, 4, 1], [1, 1, 1, 1], [6, 1, 1, 1], [0, 2, 1, 4], [7, 2, 1, 4], [1, 6, 1, 1], [6, 6, 1, 1], [2, 7, 4, 1], [7, 7, 1, 1], [8, 8, 2, 2]],
  dice: [[0, 0, 10, 1], [0, 9, 10, 1], [0, 1, 1, 8], [9, 1, 1, 8], [2, 2, 2, 2], [6, 6, 2, 2], [4, 4, 2, 2]],
  upload: [[4, 0, 2, 1], [3, 1, 4, 1], [2, 2, 6, 1], [4, 3, 2, 3], [1, 8, 8, 2]],
  pencil: [[7, 0, 2, 1], [6, 1, 4, 1], [5, 2, 4, 1], [4, 3, 4, 1], [3, 4, 4, 1], [2, 5, 4, 1], [1, 6, 4, 1], [1, 7, 3, 1], [0, 8, 3, 1], [0, 9, 2, 1]],
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

  const s = rec.statsOf(item.id);
  const recordEl = el.querySelector('.cart__record');
  recordEl.hidden = !s.plays && s.best == null;
  recordEl.textContent = recordText(s);

  const playable = online || state === 'ok' || state === 'new';
  el.querySelectorAll('[data-play]').forEach((a) => {
    a.setAttribute('aria-disabled', String(!playable));
    if (a.classList.contains('pbtn')) a.tabIndex = playable ? 0 : -1;
  });
  return el;
}

function recordText(s) {
  const parts = [];
  if (s.best != null) parts.push(`최고 ${s.best}`);
  if (s.plays) parts.push(`${s.plays}판`);
  return parts.join(' · ');
}

function inTab(item) {
  if (tab === TAB_HOME || tab === TAB_RECORDS) return true;
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
    { id: TAB_RECORDS, label: '기록', count: items.filter((i) => rec.statsOf(i.id).plays).length },
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
  const onRecords = tab === TAB_RECORDS;
  shelfEl.hidden = onRecords;
  recordsEl.hidden = !onRecords || !items.length;
  if (onRecords) renderRecords(visible);
  else shelfEl.replaceChildren(...visible.map(renderCart));

  let msg = '';
  if (!items.length) msg = '아직 선반이 비어 있어요. 곧 채워질 거예요.';
  else if (onRecords) msg = '';
  else if (!visible.length && searchEl.value.trim()) msg = '찾는 카트리지가 없어요.';
  else if (!visible.length && tab === TAB_SHELF) msg = '보관함이 비어 있어요. 마음에 드는 카트리지를 꽂아 보세요.';
  else if (!visible.length) msg = `${KIND_LABELS[tab] ?? ''} 카트리지는 준비 중이에요.`;
  messageEl.textContent = msg;
  messageEl.hidden = !msg;
}

// ───── 플레이어 카드 ─────
const nameView = $('#name-view');
const nameForm = $('#name-form');
const nameInput = $('#name-input');
const recordsEl = $('#records');
const slotsEl = $('#slots');

const displayName = () => rec.getName() || GUEST;

function renderPlayer() {
  let plays = 0;
  let time = 0;
  for (const item of items) {
    const s = rec.statsOf(item.id);
    plays += s.plays;
    time += s.time;
  }
  const { lv, title } = rec.levelOf(plays);
  $('#player-name').textContent = displayName();
  $('#player-level').textContent = `Lv.${lv} ${title}`;
  $('#stat-plays').textContent = plays;
  $('#stat-time').textContent = rec.formatTime(time);
  $('#stat-carts').textContent = installed.size;
}

function openNameForm() {
  nameInput.value = rec.getName();
  nameView.hidden = true;
  nameForm.hidden = false;
  nameInput.focus();
  nameInput.select();
}

function closeNameForm(saveIt) {
  if (nameForm.hidden) return;
  if (saveIt) {
    const before = rec.getName();
    const name = rec.setName(nameInput.value);
    if (name !== before) {
      typeLine(name ? `반가워요, ${name}!` : '이름은 언제든 다시 정할 수 있어요.');
      scheduleDefaultLine();
    }
  }
  nameForm.hidden = true;
  nameView.hidden = false;
  renderPlayer();
  renderRecordsHead();
}

$('#name-edit').addEventListener('click', openNameForm);
nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  closeNameForm(true);
  $('#name-edit').focus();
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNameForm(false);
    $('#name-edit').focus();
  }
});
nameForm.addEventListener('focusout', (e) => {
  if (!nameForm.contains(e.relatedTarget)) closeNameForm(true);
});

// ───── 기록 탭 ─────
function renderRecordsHead() {
  $('#records-name').textContent = displayName();
  const played = items.filter((i) => rec.statsOf(i.id).plays).length;
  $('#records-count').textContent = `기록 ${played} / ${items.length}`;
}

function renderRecords(list) {
  renderRecordsHead();
  const rows = list.map((item) => ({ item, s: rec.statsOf(item.id) }));
  rows.sort((a, b) => (b.s.last ?? 0) - (a.s.last ?? 0));
  const online = navigator.onLine;
  slotsEl.replaceChildren(...rows.map(({ item, s }, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const empty = !s.plays && s.best == null;
    a.className = `slot${empty ? ' slot--empty' : ''} tone-${toneOf(item)}`;
    a.href = `games/${item.id}/`;
    if (!online && !installed.has(item.id)) a.setAttribute('aria-disabled', 'true');

    const no = document.createElement('span');
    no.className = 'slot__no';
    no.textContent = String(i + 1).padStart(2, '0');

    const thumb = document.createElement('span');
    thumb.className = 'slot__thumb';
    if (item.thumbnail) {
      const img = document.createElement('img');
      img.src = `games/${item.id}/${item.thumbnail}`;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      thumb.append(img);
    }

    const title = document.createElement('span');
    title.className = 'slot__title';
    title.textContent = item.title;

    const best = document.createElement('span');
    best.className = 'slot__best';
    best.textContent = s.best != null ? `최고 ${s.best}` : empty ? '' : '기록 없음';
    best.hidden = !best.textContent;

    const meta = document.createElement('span');
    meta.className = 'slot__meta';
    meta.textContent = empty
      ? '아직 안 해 봤어요'
      : [`${s.plays}판`, rec.formatTime(s.time), rec.formatAgo(s.last)].filter(Boolean).join(' · ');

    a.append(no, thumb, title, best, meta);
    li.append(a);
    return li;
  }));
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'slots__none';
    li.textContent = '찾는 기록이 없어요.';
    slotsEl.append(li);
  }
}

function exportSave() {
  const save = rec.exportSave();
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nolja-save-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('세이브 파일을 내보냈어요.');
}

async function importSave(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    obj = null;
  }
  const count = rec.checkSave(obj);
  if (count == null) {
    toast('놀자 세이브 파일이 아니에요.');
    return;
  }
  if (!confirm(`세이브를 가져올까요?\n같은 게임의 기록은 파일 내용으로 바뀌어요. (${count}개 항목)`)) return;
  rec.importSave(obj);
  toast('세이브를 가져왔어요!');
  refreshRecords();
}

$('#save-export').addEventListener('click', exportSave);
$('#save-import').addEventListener('click', () => $('#save-file').click());
$('#save-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) importSave(file);
});

/** 게임에서 돌아왔을 때 등 기록이 바뀌었을 수 있을 때 */
function refreshRecords() {
  if (!items.length) return;
  renderPlayer();
  renderTabs();
  render();
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
  renderPlayer();
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

// ───── 마스코트 ─────
const mascotEl = $('#mascot');
const artEl = $('#mascot-art');
const bubbleText = $('#bubble-text');
const sayEl = $('#mascot-say');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FRAME_OPEN = toSvg(BODY);
const FRAME_BLINK = toSvg(blinkRows());
const defaultLine = () => {
  const name = rec.getName();
  return name ? `${name}, 오늘은 뭐 하고 놀까?` : '오늘은 뭐 하고 놀까?';
};
artEl.innerHTML = FRAME_OPEN;

function blink() {
  artEl.innerHTML = FRAME_BLINK;
  setTimeout(() => { artEl.innerHTML = FRAME_OPEN; }, 140);
}

// 말풍선 타자 효과
let typeTimer = null;
function typeLine(text) {
  clearInterval(typeTimer);
  if (reducedMotion) {
    bubbleText.textContent = text;
    return;
  }
  const chars = [...text];
  let n = 0;
  bubbleText.textContent = '';
  bubbleText.classList.add('is-typing');
  typeTimer = setInterval(() => {
    n++;
    bubbleText.textContent = chars.slice(0, n).join('');
    if (n >= chars.length) {
      clearInterval(typeTimer);
      bubbleText.classList.remove('is-typing');
    }
  }, 45);
}

// 누르면 떠오르는 도트 하트
const HEART = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges" width="14" height="12"><path fill="#ff7aa8" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/><path fill="#fff" d="M1 1h1v1H1z"/></svg>';
function hearts() {
  if (reducedMotion) return;
  [-18, 4, 22].forEach((dx, i) => {
    const h = document.createElement('span');
    h.className = 'heart';
    h.innerHTML = HEART;
    h.style.setProperty('--dx', `${dx}px`);
    h.style.animationDelay = `${i * 90}ms`;
    h.style.marginLeft = '-7px';
    mascotEl.append(h);
    h.addEventListener('animationend', () => h.remove());
  });
}

if (!reducedMotion) {
  setTimeout(() => typeLine(defaultLine()), 380);
} else {
  mascotEl.classList.remove('is-enter');
  bubbleText.textContent = defaultLine();
}
if (!reducedMotion) {
  (function loop() {
    setTimeout(() => { blink(); loop(); }, 2800 + Math.random() * 2400);
  })();
}

function mascotLines() {
  const lines = [
    '카트리지를 꽂아 두면 인터넷이 없어도 놀 수 있어요.',
    '심심하면 랜덤 플레이를 눌러 봐요!',
    '새 카트리지는 곧 들어와요. 기대해 줘요!',
  ];
  if (items.length) {
    const pick = items[Math.floor(Math.random() * items.length)];
    lines.push(`오늘은 「${pick.title}」 어때요?`);
  }
  lines.push(installed.size ? `보관함에 카트리지가 ${installed.size}개 꽂혀 있어요.` : '아직 보관함이 비어 있어요.');
  const bests = items.map((i) => ({ i, s: rec.statsOf(i.id) })).filter((x) => x.s.best != null && !x.s.lower && x.s.best > 0);
  if (bests.length) {
    const { i, s } = bests[Math.floor(Math.random() * bests.length)];
    lines.push(`「${i.title}」 최고 기록은 ${s.best}점! 깰 수 있어요?`);
  }
  if (!rec.getName()) lines.push('카드에서 연필을 누르면 이름을 정할 수 있어요.');
  if (!navigator.onLine) return ['지금은 오프라인이에요. 꽂아 둔 카트리지만 할 수 있어요.'];
  return lines;
}

let lastLine = '';
let lineTimer = null;
mascotEl.addEventListener('click', () => {
  const pool = mascotLines().filter((l) => l !== lastLine);
  lastLine = pool[Math.floor(Math.random() * pool.length)] ?? lastLine;
  typeLine(lastLine);
  sayEl.textContent = lastLine;
  mascotEl.classList.remove('is-enter', 'is-hop');
  void mascotEl.offsetWidth;
  mascotEl.classList.add('is-hop');
  blink();
  hearts();
  scheduleDefaultLine();
});
function scheduleDefaultLine() {
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => typeLine(defaultLine()), 4500);
}
mascotEl.addEventListener('animationend', (e) => {
  if (e.target === mascotEl) mascotEl.classList.remove('is-hop', 'is-enter');
});

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
// 게임에서 뒤로 가기로 돌아오거나 다른 탭에서 기록이 바뀌면 다시 그린다
window.addEventListener('pageshow', (e) => { if (e.persisted) refreshRecords(); });
window.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith('nolja:')) refreshRecords(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('서비스 워커 등록 실패', err));
}

fillIcons(document);
renderNet();
loadItems();
