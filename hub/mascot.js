// 놀자 마스코트 도트 데이터 — 허브(hub.js)와 아이콘 생성 스크립트(scripts/make-icons.mjs)가 함께 쓴다.
// 글자 하나 = 도트 하나. '.' 은 배경(투명 또는 아이콘 바탕색).

export const PALETTE = {
  D: '#1b2a4a', // 외곽선
  H: '#a9ccff', // 머리
  h: '#7097e6', // 머리 그림자
  l: '#eaf3ff', // 머리 하이라이트
  v: '#bcaaff', // 머리 끝 라일락
  S: '#ffe9dd', // 피부
  s: '#f2c9b6', // 피부 그림자
  I: '#7a5cf0', // 눈동자
  i: '#b3a1ff', // 눈동자 아래
  W: '#ffffff',
  P: '#ffaacb', // 볼터치
  M: '#d9667c', // 입
  Y: '#f5c84c', // 금색 머리핀·브로치
  y: '#c99a1e',
  N: '#2a3a66', // 옷
};

export const ICON_BG = '#dbe8ff';

const pad = (rows) => rows.map((r) => (r.length === 20 ? `..${r}..` : r));

// 24×24 전신(상반신)
export const BODY = pad([
  '........................',
  '........DDDDDDDD........',
  '......DDHHHHHHHHDD......',
  '.....DHHlHHHHHHHYYD.....',
  '....DHHllHHHHHHHYyYD....',
  '...DHHHlHHHHHHHHHYYHD...',
  '...DHHHHHHHHHHHHHHHHD...',
  'DHHHHhHHHHhHHHHhHHHD',
  'DHHHhSShSSSShSShHHHD',
  'DHHhSDDDSSSSDDDShHHD',
  'DHHhSIWISSSSIWIShHHD',
  'DHHhSiIiSSSSiIiShHHD',
  'DHHhPPSSSSSSSSPPhHHD',
  'DHHhSSSSSMMSSSSShHHD',
  'DHHHsSSSSSSSSSSsHHHD',
  'DHHHHDsSSSSSSsDHHHHD',
  'DHHHHHHDsSSsDHHHHHHD',
  'DHHhHHDWWYYWWDHHhHHD',
  'DHHHHDNNWWWWNNDHHHHD',
  'DvHHHDNNNNNNNNDHHHvD',
  'DvvHDNNNNNNNNNNDHvvD',
  'DDvvDNNNNNNNNNNDvvDD',
  'DDDDDDDDDDDDDDDDDDDD',
  '........................',
]);

// 눈 감은 프레임: BODY 의 9~11번째 줄을 바꾼다.
export const BLINK = {
  9: pad(['DHHhSSSSSSSSSSSShHHD'])[0],
  10: pad(['DHHhSDDDSSSSDDDShHHD'])[0],
  11: pad(['DHHhSSSSSSSSSSSShHHD'])[0],
};

// 16×16 얼굴 (탭 아이콘, 로고용)
export const HEAD = [
  '................',
  '....DDDDDDDD....',
  '...DHHlHHHHYD...',
  '..DHHlHHHHHYyD..',
  '..DHHHHHHHHHHD..',
  '.DHHhSShhSShHHD.',
  '.DHhSDDSSDDShHD.',
  '.DHhSIWSSIWShHD.',
  '.DHhPiiSSiiPhHD.',
  '.DHHSSSMMSSSHHD.',
  '.DHHHDsSSsDHHHD.',
  '.DHHDWWYYWWDHHD.',
  '.DvHDNNNNNNDHvD.',
  '.DvvDNNNNNNDvvD.',
  '..DDDDDDDDDDDD..',
  '................',
];

/** 도트 줄 배열 → SVG 문자열. bg 를 주면 '.' 을 그 색으로 채운다. */
export function toSvg(rows, { bg = null, size = null, title = '' } = {}) {
  const n = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let w = 1;
      while (row[x + w] === ch) w++;
      const fill = ch === '.' ? bg : PALETTE[ch];
      if (fill) rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${fill}"/>`;
      x += w;
    }
  });
  const dim = size ? ` width="${size}" height="${size}"` : '';
  const t = title ? `<title>${title}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${dim} shape-rendering="crispEdges">${t}${rects}</svg>`;
}

/** 깜빡임 프레임 */
export function blinkRows() {
  return BODY.map((r, i) => BLINK[i] ?? r);
}
