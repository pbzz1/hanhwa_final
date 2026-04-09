# 한화 전차 프로젝트 (hanhwa_final)

전차 3D 모델링, SAR 데이터 크롤링, AI 추론을 포함한 통합 프로젝트입니다.

## 프로젝트 구조

- **backend/** - NestJS API 서버
- **frontend/** - React + Vite 프론트엔드
- **ai-inference/** - AI 추론 서버 (MASt3R, YOLO 등)
- **ai/** - CRUW 레이더 학습 등 AI 노트북·요구사항 (`ai/README.md`, `ai/radar-cruw/`)
- **vod-devkit/** - View-of-Delft(VoD) 데이터 로더·시각화·레이더 문서 (`PP-Radar.md` 등)
- **gaussian/** - 3D Gaussian 관련 노트북/스크립트/문서
- **gaussian-splatting/** - 3D Gaussian Splatting 엔진 코드 (별도 clone/실행)
- **tank_sar_crawling/** - 전차 SAR 데이터 크롤링
- **google_earth_crawling/** - Google Earth SAR 크롤링
- **docs/** - 공통 프로젝트 문서

## 환경 설정

### 1. 환경 변수

```bash
# frontend
cp frontend/.env.example frontend/.env
# frontend/.env에 VITE_KAKAO_MAP_APP_KEY 설정

# backend
cp backend/.env.example backend/.env
# backend/.env에 DATABASE_URL, JWT_SECRET 등 설정
```

### 2. 외부 의존성 (별도 설치)

- **gaussian-splatting**: [graphdeco-inria/gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting) clone 후 프로젝트 루트에 배치
- **ai-inference/mast3r**: MASt3R 모델 별도 설치 (ai-inference/README.md 참고)
- **tank_sar_crawling/downloaded_tank_sar**: SAR 데이터는 별도 다운로드

자세한 설정은 `docs/` 폴더의 문서를 참고하세요.

## 실행

**한 번에 띄우기 (루트 폴더에서)** — 백엔드·프론트를 각 터미널에서 따로 치지 않아도 됩니다.

```bash
# 루트에서 최초 1회
npm install
npm run install:all   # backend + frontend 의존성

# 백엔드 + 프론트 동시 실행 (가장 자주 쓰는 조합)
npm run dev

# AI 추론 서버(8001)까지 같이 (총 3개 프로세스)
npm run dev:all
```

`dev:all`은 `ai-inference/.venv`(또는 `venv`) 안의 Python으로 `uvicorn`을 띄웁니다. 가상환경이 없으면 `ai-inference/README.md`대로 먼저 만드세요.

개별 실행이 필요할 때만:

```bash
# Backend
cd backend && npm install && npx prisma generate && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev

# AI Inference (수동)
cd ai-inference && uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 지도 드론 영상 (로컬 MP4 예시)

- YOLO 전차 인식 데모 영상: `frontend/public/media/yolo-tank-1.mp4` ~ `yolo-tank-3.mp4`가 Vite로 **`/media/yolo-tank-*.mp4`** 로 제공됩니다.
- 시드 후 DB의 적 침투 지점 `droneVideoUrl`은 `yolo-tank-1`, 아군 유닛 상황 영상은 `yolo-tank-3`를 가리킵니다. 시뮬 우측 전차 판별 패널은 코드에서 `yolo-tank-2`를 사용합니다.
- 시드 반영: `cd backend && npx prisma db seed`

## 라이선스

프로젝트 내부 정책에 따릅니다.
