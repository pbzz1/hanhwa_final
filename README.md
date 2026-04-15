# hanhwa_final

한반도 전장을 가정한 **지휘·통제(C2) 데모 웹**, **NestJS API**, **Prisma(MySQL)**, **Python AI 추론·VoD 레이더 파이프라인**을 한 저장소에서 다루는 모노레포입니다.  
시연용으로 **지도·시나리오·센서(SAR/UAV/드론/FMCW)·위험 오버레이**를 연결하고, 필요 시 **YOLO·VoD FMCW live** 등 실추론 서비스와 붙일 수 있도록 구성되어 있습니다.

---

## 목차

- [저장소 구성](#저장소-구성)
- [기술 스택 요약](#기술-스택-요약)
- [필수 요구 사항](#필수-요구-사항)
- [빠른 시작](#빠른-시작)
- [환경 변수](#환경-변수)
- [실행 스크립트](#실행-스크립트)
- [주요 URL·포트](#주요-url포트)
- [데이터베이스](#데이터베이스)
- [문서](#문서)
- [VoD·연구 노트북](#vod연구-노트북)
- [Git에 올리지 않는 항목](#git에-올리지-않는-항목)
- [라이선스](#라이선스)

---

## 저장소 구성

| 경로 | 설명 |
|------|------|
| **`frontend/`** | React 19 + Vite + TypeScript. MapLibre 지도, 시나리오 UI, 위험 E2E 시각화 등. 엔트리: `frontend/src/main.tsx`, 메인 라우트·전장 로직: `frontend/src/App.tsx`. |
| **`backend/`** | NestJS 11 REST API. 인증(`auth`), 지도·레이더·전술(`map`), AI 프록시(`ai`). Prisma: `backend/prisma/schema.prisma`. |
| **`ai-inference/`** | FastAPI(uvicorn) 기반 추론 서버. YOLO·VoD 레이더 융합 등. Nest가 `AI_INFERENCE_URL`로 호출. 자세한 내용: `ai-inference/README.md`. |
| **`radar-service/`** | VoD 형식 FMCW `.bin` 단독 처리 파이프라인(탐지·추적·위험 등). `radar-service/README.md`. |
| **`vod-devkit/`** | View-of-Delft 계열 데이터 로더·시각화·**하이브리드 위험 파이프라인** 노트북·스크립트. 대용량 수신 데이터는 `.gitignore`로 제외. |
| **`ai/`** | CRUW 레이더 학습 등 별도 트랙. `ai/README.md`, `ai/radar-cruw/`. |
| **`scripts/`** | 루트 `npm run dev`용 포트 정리, `dev:all` 시 AI·radar 서버 기동 스크립트. |
| **`docs/`** | 포트폴리오 가이드, 웹 테스트 매뉴얼, ERD, 데이터 구조 등 프로젝트 문서. |

---

## 기술 스택 요약

| 영역 | 사용 기술 |
|------|-----------|
| 프론트 | React 19, Vite 7, TypeScript, react-router-dom, **maplibre-gl**, mgrs |
| 백엔드 | NestJS 11, Prisma 6, MySQL, JWT(passport-jwt), bcrypt, class-validator |
| 외부 HTTP(데모) | OSRM 도로 경로(`backend/src/map/map-routing.service.ts`) |
| AI | Python FastAPI(`ai-inference`), 선택적으로 **radar-service** |

---

## 필수 요구 사항

- **Node.js** (프론트·백엔드 빌드에 맞는 LTS 권장)
- **MySQL** 및 `DATABASE_URL` (백엔드 `.env`)
- (선택) **Python 3** + 가상환경 — `npm run dev:all` 또는 수동 `uvicorn` 시 필요

---

## 빠른 시작

루트에서 의존성 설치 후 백엔드·프론트를 함께 띄웁니다.

```bash
# 루트 (concurrently)
npm install
npm run install:all    # backend + frontend

# 환경 변수 복사 후 값 채우기 (아래 "환경 변수" 참고)
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env

# DB 마이그레이션 및 시드 (백엔드 디렉터리에서)
cd backend
npx prisma migrate dev
npx prisma db seed
cd ..

# 백엔드(3308) + 프론트(5173) 동시 실행
npm run dev
```

브라우저에서 **`http://localhost:5173`** 접속 → 로그인(시드 예: `demo@hanhwa.local` / `Demo1234!`) → **`/`** 실시간 전장판.

**AI 추론까지 같이 띄우기** (백엔드에 `AI_INFERENCE_URL=http://127.0.0.1:8001` 등 설정 후):

```bash
npm run dev:all
```

`ai-inference` 가상환경·패키지 설치는 `ai-inference/README.md`를 따릅니다.

---

## 환경 변수

| 파일 | 용도 |
|------|------|
| **`frontend/.env.example` → `frontend/.env`** | 예: `VITE_KAKAO_MAP_APP_KEY`(시나리오 재생 등 카카오맵), `VITE_API_BASE_URL`(배포 시 API 오리진) |
| **`backend/.env.example` → `backend/.env`** | `DATABASE_URL`, `JWT_SECRET`, `AI_INFERENCE_URL`, `OSRM_BASE_URL`(선택), `FRONTEND_ORIGIN`(프로덕션 CORS) 등 |

민감 값은 **커밋하지 마세요.** (루트 `.gitignore`에 `.env` 패턴 포함)

---

## 실행 스크립트

`package.json`(루트) 기준:

| 스크립트 | 설명 |
|----------|------|
| `npm run install:all` | `backend` + `frontend`에 `npm install` |
| `npm run dev` | 포트 정리 후 **백엔드 watch + Vite** 동시 실행 |
| `npm run dev:fw` | 포트 고정 확인 후 `dev` |
| `npm run dev:all` | 백엔드·프론트 + **`ai-inference`(8001)** + **`radar-service`(8090)** |
| `npm run dev:all:fw` | 포트 확인 후 `dev:all` |

개별 실행 예:

```bash
cd backend && npm run start:dev
cd frontend && npm run dev
```

---

## 주요 URL·포트

| 서비스 | 기본 포트 | 비고 |
|--------|-----------|------|
| Vite (프론트) | **5173** | 개발 시 `/auth`, `/map`, `/ai`는 **Vite 프록시** → 백엔드 (`frontend/vite.config.ts`) |
| Nest API | **3308** | `backend/src/main.ts`의 `PORT` |
| AI Inference | **8001** | `scripts/run-ai-server.mjs`, `AI_INFERENCE_URL` |
| radar-service | **8090** | `scripts/run-radar-service.mjs` |

HTTPS 터널(ngrok 등)을 쓸 때는 프론트가 **동일 오리진**으로 API를 부르도록 `frontend/src/apiBaseUrl.ts`와 Vite 프록시를 사용하는 구조입니다.

---

## 데이터베이스

- **ORM**: Prisma — 모델: `User`, `Media`, `InferenceResult`, `Unit`, `InfiltrationPoint` 등 (`backend/prisma/schema.prisma`).
- **전술 추천/저장**: Prisma 스키마 외에 `MapService`가 **`tactical_recommendation_profiles`**, **`tactical_decisions`** 테이블을 raw SQL로 생성·사용할 수 있습니다.
- **ERD·구조 설명**: `docs/ERD.md`, `docs/ERD-viewer.html` 참고.

---

## 문서

| 문서 | 내용 |
|------|------|
| **`docs/PORTFOLIO_AND_INTERVIEW_GUIDE.md`** | 포트폴리오·면접용으로 전체 아키텍처·API·핵심 파일 정리 |
| **`docs/WEB_TEST_MANUAL.md`** | 웹 접속 → 로그인 → 작전 구역 → SAR 전개 → SAR-2 구역 등 **시나리오 테스트 절차** |
| **`docs/DATA_STRUCTURE.md`**, **`docs/PROJECT_SCOPE.md`** | 데이터·범위 |
| **`backend/README.md`**, **`frontend/README.md`**, **`ai-inference/README.md`**, **`radar-service/README.md`** | 각 패키지별 세부 안내 |

---

## VoD·연구 노트북

- **`vod-devkit/`**: VoD 프레임 로딩·평가·시각화, **하이브리드 위험 E2E** 노트북(예: `21_vod_hybrid_risk_pipeline_e2e_runall.ipynb`) 및 파이프라인 스크립트(`vod_e2e_pipeline.py` 등).
- **대용량 데이터셋**(`vod-devkit/vod-received/...`)은 용량·라이선스상 저장소에 포함하지 않습니다. `.gitignore`와 `vod-devkit/README.md`(상위 VoD 문서 링크)를 참고해 로컬에 받습니다.

---

## Git에 올리지 않는 항목

루트 **`.gitignore`** 요약:

- `node_modules/`, `dist/`, `.env*`, Python `venv`/`.venv`
- 대용량 **체크포인트·데이터·zip**, VoD 수신본 일부 경로
- `ai/radar-cruw/vendor/` 등 외부 벤더/clone 디렉터리

푸시 전 `git status`로 민감 파일이 없는지 확인하세요.

---

## 라이선스

프로젝트 내부 정책에 따릅니다. 서브모듈·데이터셋(예: VoD 원본)은 각각의 라이선스를 따릅니다.

---

## 관련 링크

- 원격 저장소: GitHub `pbzz1/hanhwa_final` (원격 이름은 `origin`으로 설정된 경우가 많습니다.)
- 기능 브랜치 작업 후 **`master`/`main` 병합**은 Pull Request로 진행하는 것을 권장합니다.
