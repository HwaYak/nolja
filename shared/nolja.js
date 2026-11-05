// 놀자 공용 SDK — 게임 페이지에서 <script src="../../shared/nolja.js"></script> 로 불러온다.
// - 화면 구석에 "← 놀자" 버튼을 붙인다. (<body data-nolja-back="off"> 이면 붙이지 않음)
// - Nolja.save / load / remove: 게임별로 구분된 세이브 저장소 (localStorage)
// - Nolja.start / finish / stats: 판 수, 플레이 시간, 최고 기록 (허브에 표시됨)
(function () {
  'use strict';

  const match = location.pathname.match(/\/games\/([a-z0-9-]+)\//);
  const gameId = match ? match[1] : 'unknown';
  const hubUrl = new URL('../../', location.href).href;
  const prefix = `nolja:${gameId}:`;

  function save(key, value) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(prefix + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(prefix + key); } catch { /* 무시 */ }
  }

  // ───── 기록: 허브의 플레이어 카드와 기록 탭에 보인다 ─────
  // 한 판 시작할 때 Nolja.start(), 끝날 때 Nolja.finish({ score }) 를 부른다.
  // 판 수와 플레이 시간(화면이 보이는 동안만)은 자동으로 센다.
  const STATS = '_stats';
  const MAX_SESSION = 3 * 3600; // 한 판에 3시간 넘게는 세지 않는다
  let sessionAt = 0;

  function stats() {
    const s = load(STATS, null) || {};
    const legacy = s.best == null ? load('best', null) : null; // 예전 방식으로 저장한 최고 기록
    const best = s.best ?? (typeof legacy === 'number' && legacy > 0 ? legacy : null);
    return {
      plays: Number(s.plays) || 0,
      time: Number(s.time) || 0,
      best: typeof best === 'number' ? best : null,
      lower: s.lower === true,
      last: Number(s.last) || null,
    };
  }

  function addTime() {
    if (!sessionAt) return;
    const sec = Math.min(MAX_SESSION, Math.max(0, (Date.now() - sessionAt) / 1000));
    sessionAt = Date.now();
    const s = stats();
    s.time = Math.round((s.time + sec) * 10) / 10;
    save(STATS, s);
  }

  function start() {
    addTime();
    const s = stats();
    s.plays += 1;
    s.last = Date.now();
    save(STATS, s);
    sessionAt = Date.now();
  }

  /** @param {{score?: number, lower?: boolean}} result lower: 낮을수록 좋은 기록(시간 등) */
  function finish(result = {}) {
    addTime();
    sessionAt = 0;
    const s = stats();
    s.last = Date.now();
    let isBest = false;
    const score = Number(result.score);
    if (result.score != null && Number.isFinite(score)) {
      const lower = result.lower === true;
      if (s.best == null || (lower ? score < s.best : score > s.best)) {
        s.best = score;
        isBest = true;
      }
      s.lower = lower;
    }
    save(STATS, s);
    return { best: s.best, isBest };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) addTime();
    else if (sessionAt) sessionAt = Date.now();
  });
  window.addEventListener('pagehide', addTime);
  window.addEventListener('pageshow', () => { if (sessionAt) sessionAt = Date.now(); });

  // 허브와 같은 도트 글꼴을 게임 페이지에서도 쓸 수 있게 불러온다.
  function addFont() {
    const href = new URL('fonts/galmuri.css', document.currentScript?.src ?? new URL('../../shared/', location.href)).href;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  addFont();

  function addBackButton() {
    if (document.body.dataset.noljaBack === 'off') return;
    const a = document.createElement('a');
    a.href = hubUrl;
    a.textContent = '◀ 놀자';
    a.setAttribute('aria-label', '놀자 목록으로 돌아가기');
    Object.assign(a.style, {
      position: 'fixed', top: 'max(10px, env(safe-area-inset-top))', left: '10px', zIndex: '2147483000',
      padding: '7px 10px 6px',
      background: '#ffffff', color: '#1b2a4a',
      border: '2px solid #1b2a4a', boxShadow: '3px 3px 0 #1b2a4a',
      font: '700 13px/1 "Galmuri11", monospace',
      textDecoration: 'none',
    });
    a.addEventListener('pointerdown', () => { a.style.translate = '2px 2px'; a.style.boxShadow = '1px 1px 0 #1b2a4a'; });
    a.addEventListener('pointerleave', () => { a.style.translate = ''; a.style.boxShadow = '3px 3px 0 #1b2a4a'; });
    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBackButton);
  else addBackButton();

  window.Nolja = Object.freeze({ gameId, hubUrl, save, load, remove, start, finish, stats });
})();
