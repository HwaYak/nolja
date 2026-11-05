(() => {
  'use strict';

  const DURATION = 30; // 초

  // 종류별 이미지, 점수, 등장 가중치, 속도 배율
  const KINDS = [
    { name: 'red', points: 1, weight: 22, speed: 1, color: '#ff5a5f' },
    { name: 'blue', points: 1, weight: 22, speed: 1, color: '#4d8dff' },
    { name: 'yellow', points: 1, weight: 22, speed: 1, color: '#ffd447' },
    { name: 'green', points: 1, weight: 22, speed: 1, color: '#4cd18a' },
    { name: 'gold', points: 5, weight: 5, speed: 1.6, color: '#ffe27a' },
    { name: 'black', points: -3, weight: 12, speed: 0.9, color: '#4a4652' },
  ];
  const TIME_SLOTS = 10;
  const TOTAL_WEIGHT = KINDS.reduce((s, k) => s + k.weight, 0);

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const timeBox = $('time-box');
  const timeBar = $('time-bar');
  const scoreEl = $('score');
  const timeEl = $('time');
  for (let i = 0; i < TIME_SLOTS; i++) timeBar.append(document.createElement('i'));
  const timeCells = [...timeBar.children];
  function renderTime() {
    timeEl.textContent = Math.ceil(timeLeft);
    const on = Math.ceil((timeLeft / DURATION) * TIME_SLOTS);
    timeCells.forEach((c, i) => c.classList.toggle('on', i < on));
    timeBox.classList.toggle('is-hurry', running && timeLeft <= 5);
  }
  const startScreen = $('start');
  const resultScreen = $('result');

  // 기록은 놀자 SDK 가 남긴다. (허브의 플레이어 카드·기록 탭에 보임)
  const N = window.Nolja;
  let best = (N && N.stats().best) || 0;
  let score = 0;
  let timeLeft = DURATION;
  let running = false;
  let lastTs = 0;
  let spawnIn = 0;
  /** @type {Array<{el:HTMLImageElement,kind:any,x:number,y:number,w:number,h:number,vy:number,phase:number}>} */
  let balloons = [];

  // ---------- 소리 (WebAudio 합성, 파일 없음) ----------
  let audio = null;
  function ensureAudio() {
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audio = new Ctx();
    }
    if (audio && audio.state === 'suspended') audio.resume();
  }

  function noiseBurst(duration, freq, gain) {
    const len = Math.floor(audio.sampleRate * duration);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const g = audio.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(audio.destination);
    src.start();
  }

  function tone(freq, start, duration, type = 'sine', gain = 0.2, endFreq = freq) {
    const t = audio.currentTime + start;
    const osc = audio.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    const g = audio.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  function playSound(kind) {
    if (!audio) return;
    try {
      if (kind.name === 'black') {
        tone(160, 0, 0.25, 'triangle', 0.35, 45);
      } else if (kind.name === 'gold') {
        noiseBurst(0.08, 2200, 0.6);
        tone(880, 0, 0.12, 'sine', 0.18);
        tone(1320, 0.08, 0.2, 'sine', 0.18);
      } else {
        noiseBurst(0.09, 1400 + Math.random() * 800, 0.7);
      }
    } catch {
      /* 소리 실패는 무시 */
    }
  }

  // ---------- 게임 ----------
  function pickKind() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const k of KINDS) {
      r -= k.weight;
      if (r <= 0) return k;
    }
    return KINDS[0];
  }

  function progress() {
    return 1 - timeLeft / DURATION; // 0 → 1
  }

  function spawn() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const kind = pickKind();
    // 12×16 도트 스프라이트를 정수 배율로 키워 선명하게
    const scale = Math.max(4, Math.min(7, Math.round((W * 0.13) / 12)));
    const w = 12 * scale;
    const h = 16 * scale;
    const el = document.createElement('img');
    el.src = `assets/balloon-${kind.name}.svg`;
    el.alt = '';
    el.className = 'balloon';
    el.draggable = false;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const b = {
      el,
      kind,
      x: Math.random() * Math.max(0, W - w),
      y: H + 10,
      w,
      h,
      // 화면을 다 올라가는 데 4.5초 → 2.2초로 점점 빨라짐
      vy: ((H + h) / (4.5 - 2.3 * progress())) * kind.speed * (0.85 + Math.random() * 0.3),
      phase: Math.random() * Math.PI * 2,
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pop(b);
    });
    stage.appendChild(el);
    balloons.push(b);
    place(b, 0);
  }

  // 도트 느낌이 나도록 4px 단위로 움직인다
  const snap = (v) => Math.round(v / 4) * 4;
  function place(b, t) {
    const sway = Math.sin(t * 2 + b.phase) * 8;
    b.el.style.transform = `translate(${snap(b.x + sway)}px, ${snap(b.y)}px)`;
  }

  // 터질 때 사방으로 튀는 도트 조각
  const BIT_DIRS = [[-1, -1], [0, -1.3], [1, -1], [-1.3, 0], [1.3, 0], [-1, 1], [0, 1.3], [1, 1]];
  function burst(b) {
    const cx = b.x + b.w / 2 - 4;
    const cy = b.y + b.h * 0.33 - 4;
    const dist = b.w * 0.55;
    for (const [dx, dy] of BIT_DIRS) {
      const bit = document.createElement('span');
      bit.className = 'bit';
      bit.style.left = `${snap(cx)}px`;
      bit.style.top = `${snap(cy)}px`;
      bit.style.setProperty('--c', b.kind.color);
      bit.style.setProperty('--dx', `${snap(dx * dist)}px`);
      bit.style.setProperty('--dy', `${snap(dy * dist)}px`);
      stage.appendChild(bit);
      bit.addEventListener('animationend', () => bit.remove());
    }
  }

  function pop(b) {
    if (!running || b.popped) return;
    b.popped = true;
    score = Math.max(0, score + b.kind.points);
    scoreEl.textContent = score;
    playSound(b.kind);
    if (navigator.vibrate && b.kind.points < 0) navigator.vibrate(60);

    const text = document.createElement('div');
    const cls = b.kind.points < 0 ? 'minus' : b.kind.name === 'gold' ? 'gold' : 'plus';
    text.className = `float-text float-text--${cls}`;
    text.textContent = b.kind.points > 0 ? `+${b.kind.points}` : `${b.kind.points}`;
    text.style.left = `${snap(b.x + b.w / 2 - 14)}px`;
    text.style.top = `${snap(b.y + b.h * 0.2)}px`;
    stage.appendChild(text);
    setTimeout(() => text.remove(), 700);

    burst(b);
    b.el.classList.add('is-popped');
    setTimeout(() => b.el.remove(), 60);
    balloons = balloons.filter((x) => x !== b);
  }

  function clearBalloons() {
    balloons.forEach((b) => b.el.remove());
    balloons = [];
    stage.querySelectorAll('.float-text, .bit').forEach((el) => el.remove());
  }

  function tick(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;

    timeLeft = Math.max(0, timeLeft - dt);
    renderTime();

    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawn();
      // 0.7초 → 0.28초 간격으로 점점 자주
      spawnIn = 0.7 - 0.42 * progress();
    }

    const t = ts / 1000;
    for (const b of [...balloons]) {
      b.y -= b.vy * dt;
      if (b.y < -b.h - 20) {
        b.el.remove();
        balloons = balloons.filter((x) => x !== b);
      } else {
        place(b, t);
      }
    }

    if (timeLeft <= 0) finish();
    else requestAnimationFrame(tick);
  }

  function start() {
    ensureAudio();
    clearBalloons();
    score = 0;
    timeLeft = DURATION;
    spawnIn = 0;
    scoreEl.textContent = '0';
    startScreen.hidden = true;
    resultScreen.hidden = true;
    if (N) N.start();
    running = true;
    renderTime();
    lastTs = performance.now();
    requestAnimationFrame(tick);
  }

  function finish() {
    running = false;
    renderTime();
    let isBest = score > best;
    if (N) {
      const r = N.finish({ score });
      isBest = r.isBest && score > 0;
      best = r.best ?? best;
    } else if (isBest) {
      best = score;
    }
    setTimeout(() => {
      clearBalloons();
      $('final').textContent = score;
      $('best-result').textContent = best;
      $('new-best').hidden = !isBest;
      resultScreen.hidden = false;
      $('again').focus();
    }, 400);
  }

  renderTime();
  $('best-start').textContent = best;
  $('play').addEventListener('click', start);
  $('again').addEventListener('click', start);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  // 탭을 떠나면 일시정지 대신 시간 계산이 튀지 않게 lastTs 를 갱신
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastTs = performance.now();
  });
})();
