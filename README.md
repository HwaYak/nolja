# 놀자 (nolja)

심심할 때 하나씩 꺼내 하는 웹 게임 모음입니다.

- 주소: https://hwayak.github.io/nolja/
- 호스팅: GitHub Pages (`main` 브랜치 루트)

## 구조 (예정)

```
/index.html              게임 목록 허브
/games.json              게임 등록부 (id, 제목, 썸네일, 용량, 버전)
/shared/                 공용 코드: 다운로드 관리, 세이브, 설정, 사운드
/games/<게임id>/         게임별 코드와 리소스 (assets.json 포함)
/sw.js                   서비스 워커: 게임별 리소스를 로컬에 받아 두고 오프라인 실행
/manifest.webmanifest    앱 설치 정보
```

## 새 게임 추가

1. `games/<게임id>/` 폴더를 만들고 `index.html`과 `assets.json`을 넣습니다.
2. `games.json`에 항목을 하나 추가합니다.
