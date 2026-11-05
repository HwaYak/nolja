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

  function addBackButton() {
    if (document.body.dataset.noljaBack === 'off') return;
    const a = document.createElement('a');
    a.href = hubUrl;
    a.textContent = '← 놀자';
    a.setAttribute('aria-label', '놀자 게임 목록으로 돌아가기');
    Object.assign(a.style, {
      position: 'fixed', top: 'max(10px, env(safe-area-inset-top))', left: '10px', zIndex: '2147483000',
      padding: '6px 12px', borderRadius: '999px',
      background: 'rgba(0,0,0,.55)', color: '#fff',
      font: '700 14px/1.2 system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      textDecoration: 'none', backdropFilter: 'blur(6px)',
    });
    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBackButton);
  else addBackButton();

  window.Nolja = Object.freeze({ gameId, hubUrl, save, load, remove });
})();
