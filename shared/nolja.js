// 놀자 공용 SDK — 게임 페이지에서 <script src="../../shared/nolja.js"></script> 로 불러온다.
// - 화면 구석에 "← 놀자" 버튼을 붙인다. (<body data-nolja-back="off"> 이면 붙이지 않음)
// - Nolja.save / load / remove: 게임별로 구분된 세이브 저장소 (localStorage)
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

  window.Nolja = Object.freeze({ gameId, hubUrl, save, load, remove });
})();
