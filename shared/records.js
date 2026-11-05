// 놀자 로컬 기록 — 허브에서 쓰는 모듈.
// 게임 기록은 shared/nolja.js 의 Nolja.start()/finish() 가 localStorage 에 남긴다.
//   nolja:<게임id>:_stats → { plays, time(초), best, lower, last(ms) }
// 허브 자체 설정은 nolja:_hub:<키> 에 둔다. (게임 id 는 _ 로 시작할 수 없어서 겹치지 않는다)

const PREFIX = 'nolja:';
const HUB = 'nolja:_hub:';
export const NAME_MAX = 12;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 게임 하나의 기록. 예전 게임이 따로 저장한 'best' 도 최고 기록으로 읽는다. */
export function statsOf(id) {
  const s = read(`${PREFIX}${id}:_stats`, null) || {};
  const legacy = s.best == null ? read(`${PREFIX}${id}:best`, null) : null;
  const best = s.best ?? (typeof legacy === 'number' && legacy > 0 ? legacy : null);
  return {
    plays: Number(s.plays) || 0,
    time: Number(s.time) || 0,
    best: typeof best === 'number' ? best : null,
    lower: s.lower === true,
    last: Number(s.last) || null,
  };
}

export function getName() {
  return String(read(`${HUB}name`, '') || '').trim().slice(0, NAME_MAX);
}

export function setName(name) {
  const v = String(name ?? '').trim().slice(0, NAME_MAX);
  if (v) write(`${HUB}name`, v);
  else {
    try { localStorage.removeItem(`${HUB}name`); } catch { /* 무시 */ }
  }
  return v;
}

const TITLES = ['새내기', '놀이꾼', '단골', '고수', '달인', '전설'];
/** 전체 판 수로 정하는 레벨과 칭호 */
export function levelOf(plays) {
  const lv = Math.floor(Math.sqrt(plays / 2)) + 1;
  return { lv, title: TITLES[Math.min(lv, TITLES.length) - 1] };
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분`;
  const h = sec / 3600;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)}시간`;
}

export function formatAgo(ts) {
  if (!ts) return '';
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const then = new Date(ts);
  const diff = Math.round((day(new Date()) - day(then)) / 86400000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return `${then.getMonth() + 1}월 ${then.getDate()}일`;
}

// ───── 세이브 내보내기 / 가져오기 ─────

/** nolja: 로 시작하는 저장값을 모두 모은다 */
export function exportSave() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) data[key] = localStorage.getItem(key);
    }
  } catch { /* 저장소를 못 쓰면 빈 세이브 */ }
  return { app: 'nolja', format: 1, exportedAt: new Date().toISOString(), data };
}

/** 세이브 파일 내용을 검사한다. 맞으면 저장할 항목 수, 아니면 null */
export function checkSave(obj) {
  if (!obj || obj.app !== 'nolja' || typeof obj.data !== 'object' || obj.data === null) return null;
  return Object.entries(obj.data).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === 'string').length;
}

/** 세이브를 덮어쓴다. 파일에 없는 기록은 그대로 둔다. */
export function importSave(obj) {
  let n = 0;
  for (const [key, value] of Object.entries(obj.data)) {
    if (!key.startsWith(PREFIX) || typeof value !== 'string') continue;
    try {
      JSON.parse(value);
      localStorage.setItem(key, value);
      n++;
    } catch { /* 깨진 값은 건너뜀 */ }
  }
  return n;
}
