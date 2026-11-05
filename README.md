# 놀자 (nolja)

심심할 때 하나씩 꺼내 하는 웹 게임 모음입니다.

- 주소: https://hwayak.github.io/nolja/
- 게임을 **받아 두면** 다음부터는 브라우저 저장소(Cache Storage)에서 바로 열리고, 오프라인에서도 플레이할 수 있습니다.

## 개발

Node 20 이상만 있으면 됩니다. 설치할 패키지는 없습니다.

```bash
node scripts/dev.mjs
```

- http://localhost:8080/ 에서 열립니다. 파일을 고치면 자동으로 다시 빌드되니 새로고침만 하면 됩니다.
- `scripts/` 안의 파일을 고쳤다면 개발 서버를 껐다가 다시 켜세요.
- 서비스 워커가 예전 파일을 보여 주는 것 같으면 `Ctrl+Shift+R`(강력 새로고침)을 누르세요.
- 빌드만 하려면 `node scripts/build.mjs` → 결과는 `_site/` (git에는 올리지 않음)

## 구조

```
index.html               게임 목록 허브
hub/                     허브 화면 (hub.css, hub.js)
shared/nolja.js          게임용 공용 SDK: "← 놀자" 버튼, 세이브, 기록(판 수·시간·최고 기록)
shared/records.js        허브용 기록 모듈: 플레이어 카드, 기록 탭, 세이브 내보내기/가져오기
shared/downloads.js      다운로드 관리자: 받기 / 업데이트 / 삭제
sw.js                    서비스 워커: 받아 둔 게임은 캐시에서, 나머지는 네트워크 우선
manifest.webmanifest     앱 설치 정보
icons/                   앱 아이콘
games/<id>/              게임 하나 = 폴더 하나
scripts/build.mjs        _site/ 생성, games.json · files.json · 서비스 워커 버전 자동 생성
scripts/dev.mjs          개발 서버
.github/workflows/       main 에 push 되면 빌드해서 GitHub Pages 에 배포
```

## 마스코트와 아이콘

- 마스코트 도트 데이터는 `hub/mascot.js`에 있습니다. 글자 하나가 도트 하나입니다.
- 허브 상단 마스코트는 이 데이터로 그립니다. 가끔 눈을 깜빡이고, 누르면 대사를 합니다.
- 앱 아이콘과 탭 아이콘은 마스코트의 금색 별 머리핀(`STAR`)을 파란 바탕에 그린 것입니다.
- 도트를 고친 뒤 아래 명령을 실행하면 `icons/`의 아이콘이 모두 다시 만들어집니다.

```bash
node scripts/make-icons.mjs
```

## 새 게임 추가

1. 브랜치를 만듭니다: `git switch -c game/<id>`
2. `games/<id>/` 폴더를 만듭니다. `<id>`는 영어 소문자, 숫자, `-`만 씁니다.
3. 폴더에 `index.html`과 `meta.json`을 넣습니다.

   ```json
   {
     "title": "게임 이름",
     "description": "한두 줄 설명",
     "thumbnail": "thumb.svg",
     "kind": "game",
     "tags": ["캐주얼"],
     "color": "sky",
     "order": 100
   }
   ```

   - `kind`는 카트리지 종류입니다: `game`(게임), `tool`(도구). 비우면 `game`.
   - `order`가 작을수록 목록 앞에 나옵니다.
   - `color`는 허브 카드의 파스텔 색입니다: `sky`, `lavender`, `mint`, `peach`, `butter`, `pink`. 비우면 id에 따라 자동으로 정해집니다.
   - `"featured": true`인 게임은 허브 맨 앞에 넓은 카드로 나옵니다. 없으면 목록 첫 게임이 그 자리에 옵니다.
   - 리소스 목록, 용량, 버전은 빌드가 자동으로 계산합니다. 따로 적지 않습니다.
4. 게임 페이지에서 공용 SDK를 불러오면 "← 놀자" 버튼, 세이브, 기록 기능을 쓸 수 있습니다.

   ```html
   <script src="../../shared/nolja.js"></script>
   <script>
     // 한 판 시작과 끝에 부르면 허브의 플레이어 카드와 기록 탭에 나옵니다.
     Nolja.start();                                   // 판 수 +1, 플레이 시간 재기 시작
     const { best, isBest } = Nolja.finish({ score: 120 });
     // 낮을수록 좋은 기록(걸린 시간 등)은 Nolja.finish({ score: 42.5, lower: true })
     Nolja.stats();                                   // { plays, time, best, lower, last }

     // 그 밖의 게임 데이터는 자유롭게 저장합니다.
     Nolja.save('stage', 3);
     const stage = Nolja.load('stage', 1);
   </script>
   ```

   - 플레이 시간은 화면이 보이는 동안만 셉니다.
   - 기록은 그 브라우저에만 남습니다. 허브의 "기록" 탭에서 세이브 파일로 내보내고 가져올 수 있습니다.

5. 게임 안에서 쓰는 파일은 **게임 폴더 안에** 두고 상대 경로로 불러옵니다. 그래야 "받기"할 때 함께 저장되어 오프라인에서도 동작합니다.

## 브랜치 규칙

- `main`: 지금 공개된 사이트. 직접 커밋하지 않습니다.
- `game/<id>`: 게임 하나. `games/<id>/` 폴더만 건드립니다.
- `feat/<내용>`: 허브, 공용 SDK, 빌드 같은 공용 기능.
- PR을 만들어 **Squash and merge** 로 `main`에 넣습니다. 머지되면 자동으로 배포됩니다.
