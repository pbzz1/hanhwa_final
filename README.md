# hanhwa_final

한반도 전장을 가정한 **지휘·통제(C2) 데모 웹**, **NestJS API**, **Prisma(PostgreSQL)**를 한 저장소에서 다루는 모노레포입니다.  
시연용으로 **지도·시나리오·센서(SAR/UAV/드론/FMCW)·위험 오버레이**를 연결하고, 백엔드·프론트 중심으로 운용할 수 있도록 구성되어 있습니다.

---

## 목차

- [저장소 구성](#저장소-구성)
- [기술 스택 요약](#기술-스택-요약)
- [필수 요구 사항](#필수-요구-사항)
- [빠른 시작](#빠른-시작)
- [다른 PC에서 작업하기](#team-onboarding)
- [환경 변수](#환경-변수)
- [실행 스크립트](#실행-스크립트)
- [주요 URL·포트](#주요-url포트)
- [데이터베이스](#데이터베이스)
- [Vercel·Render 배포](#vercelrender-배포)
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
| **`radar-service/`** | VoD 형식 FMCW `.bin` 단독 처리 파이프라인(탐지·추적·위험 등). `radar-service/README.md`. |
| **`scripts/`** | 루트 `npm run dev`용 포트 정리, `dev:all` 시 radar-service 기동 스크립트. |
| **`docs/`** | 포트폴리오 가이드, 웹 테스트 매뉴얼, ERD, 데이터 구조 등 프로젝트 문서. |

---

## 기술 스택 요약

| 영역 | 사용 기술 |
|------|-----------|
| 프론트 | React 19, Vite 7, TypeScript, react-router-dom, **maplibre-gl**, mgrs |
| 백엔드 | NestJS 11, Prisma 6, PostgreSQL, JWT(passport-jwt), bcrypt, class-validator |
| 외부 HTTP(데모) | OSRM 도로 경로(`backend/src/map/map-routing.service.ts`) |
| Radar | Python FastAPI(`radar-service`) |

---

## 필수 요구 사항

- **Node.js** (프론트·백엔드 빌드에 맞는 LTS 권장)
- **PostgreSQL** 및 `DATABASE_URL` (백엔드 `.env`)
- (선택) **Python 3** + 가상환경 — `radar-service` 실행 시 필요

---

## 빠른 시작

루트에서 의존성 설치 후 백엔드·프론트를 함께 띄웁니다.

```bash
# 루트 (concurrently)
npm install
npm run install:all    # backend + frontend

# 환경 변수 복사 후 값 채우기 (아래 "환경 변수" 참고)
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
# Windows CMD: copy frontend\.env.example frontend\.env

# DB 마이그레이션 및 시드 (백엔드 디렉터리에서)
cd backend
npx prisma migrate dev
npx prisma db seed
cd ..

# 백엔드(3308) + 프론트(5173) 동시 실행
npm run dev
```

브라우저에서 **`http://localhost:5173`** 접속 → 로그인(시드 예: `demo@hanhwa.local` / `Demo1234!`) → **`/`** 실시간 전장판.

**radar-service까지 같이 띄우기**:

```bash
npm run dev:all
```

<h2 id="team-onboarding">다른 PC에서 작업하기</h2>

GitHub에는 **소스·스키마·재현 절차**만 두고, **빌드 산출물·비밀키·로컬 DB 덤프·아주 큰 바이너리**는 올리지 않는 것을 기본으로 합니다.

### 팀원 체크리스트

1. 저장소 `git clone` 후 이 README의 [빠른 시작](#빠른-시작)대로 `npm install` → `npm run install:all`.
2. `frontend/.env.example` → `frontend/.env`, `backend/.env.example` → `backend/.env` 복사 후 값 입력 (Windows: `copy` 명령).
3. PostgreSQL 기동 후 `backend`에서 `npx prisma migrate dev` 및 필요 시 `npx prisma db seed`.
4. **UAV EO/IR 데모 영상** (`frontend/public/media/uav/eo/*.mp4`, `.../ir/*.mp4`)은 루트 `.gitignore`로 Git 추적에서 제외됩니다. 저장소를 클론한 뒤에는 팀에서 공유하는 ZIP·NAS·드라이브 등으로 파일을 받아 **동일 경로·파일명**으로 두세요. 규칙은 각 폴더의 `README.md`를 따릅니다. (이미 Git에 올라가 있는 다른 데모용 `*.mp4`·PNG는 `clone`만으로 함께 받습니다.)
5. 개발 서버: 루트에서 `npm run dev` (또는 radar-service까지 `npm run dev:all`).
6. 커밋·푸시 전 `git status`로 `.env`, `node_modules`, `dist/`, 덤프·개인 데이터가 포함되지 않았는지 확인합니다.

### 대용량을 꼭 버전 관리하고 싶다면

- [Git LFS](https://git-lfs.com/)로 특정 확장자만 LFS 대상으로 지정할 수 있습니다. 저장소·조직의 LFS 할당량을 확인하세요.
- 대용량 원본 데이터·학습 가중치 등은 별도 아티팩트 저장소에 보관하는 것을 권장합니다.

---

## 환경 변수

| 파일 | 용도 |
|------|------|
| **`frontend/.env.example` → `frontend/.env`** | 예: `VITE_KAKAO_MAP_APP_KEY`(시나리오 재생 등 카카오맵), `VITE_API_BASE_URL`(배포 시 API 오리진) |
| **`backend/.env.example` → `backend/.env`** | `DATABASE_URL`, `JWT_SECRET`, `OSRM_BASE_URL`(선택), `FRONTEND_ORIGIN`(프로덕션 CORS) 등 |

민감 값은 **커밋하지 마세요.** (루트 `.gitignore`에 `.env` 패턴 포함)

---

## 실행 스크립트

`package.json`(루트) 기준:

| 스크립트 | 설명 |
|----------|------|
| `npm run install:all` | `backend` + `frontend`에 `npm install` |
| `npm run dev` | 포트 정리 후 **백엔드 watch + Vite** 동시 실행 |
| `npm run dev:fw` | 포트 고정 확인 후 `dev` |
| `npm run dev:all` | 백엔드·프론트 + **`radar-service`(8090)** |
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
| radar-service | **8090** | `scripts/run-radar-service.mjs` |

HTTPS 터널(ngrok 등)을 쓸 때는 프론트가 **동일 오리진**으로 API를 부르도록 `frontend/src/apiBaseUrl.ts`와 Vite 프록시를 사용하는 구조입니다.

---

## 데이터베이스

- **ORM**: Prisma — 모델: `User`, `Media`, `InferenceResult`, `Unit`, `InfiltrationPoint` 등 (`backend/prisma/schema.prisma`).
- **전술 추천/저장**: Prisma 스키마 외에 `MapService`가 **`tactical_recommendation_profiles`**, **`tactical_decisions`** 테이블을 raw SQL로 생성·사용할 수 있습니다.
- **ERD·구조 설명**: `docs/ERD.md`, `docs/ERD-viewer.html` 참고.

---

<h2 id="vercelrender-배포">Vercel·Render 배포</h2>

1. **Render**: 저장소를 GitHub 등에 푸시한 뒤 [Render Blueprint](https://render.com/docs/infrastructure-as-code)로 루트의 `render.yaml`을 지정합니다. PostgreSQL과 `hanhwa-backend` 웹 서비스가 생성됩니다. 대시보드에서 **`FRONTEND_ORIGIN`**을 Vercel 배포 URL(예: `https://xxx.vercel.app`)으로 설정합니다. (첫 생성 시 `sync: false`로 입력을 요구합니다.)
2. **Vercel**: New Project → 동일 저장소, **Root Directory**를 `frontend`로 지정합니다. **Environment Variables**에 `VITE_API_BASE_URL` = Render 백엔드 공개 URL(끝에 `/` 없이)을 넣고 배포합니다.
3. 시드·데모 데이터가 필요하면 Render Shell에서 `backend` 디렉터리로 이동해 `npx prisma db seed`를 실행합니다.
4. `frontend/vercel.json`은 SPA용 rewrite를 포함합니다.

---

## 문서

| 문서 | 내용 |
|------|------|
| **`docs/PORTFOLIO_AND_INTERVIEW_GUIDE.md`** | 포트폴리오·면접용으로 전체 아키텍처·API·핵심 파일 정리 |
| **`docs/WEB_TEST_MANUAL.md`** | 웹 접속 → 로그인 → 작전 구역 → SAR 전개 → SAR-2 구역 등 **시나리오 테스트 절차** |
| **`docs/DATA_STRUCTURE.md`**, **`docs/PROJECT_SCOPE.md`** | 데이터·범위 |
| **`backend/README.md`**, **`frontend/README.md`**, **`radar-service/README.md`** | 각 패키지별 세부 안내 |

---

## VoD·연구 노트북

현재 저장소에는 VoD 연구 노트북 번들이 포함되어 있지 않습니다.

---

## Git에 올리지 않는 항목

루트 **`.gitignore`** 요약:

- `node_modules/`, `dist/`, `.env*`(예시 `!.env.example` 제외), Python `venv`/`.venv`
- TypeScript `*.tsbuildinfo`, 테스트 `coverage/`, OS 잡파일(`Thumbs.db` 등)
- 로컬 DB 파일 패턴(`*.sqlite`, `*.db` 등) 및 `dumps/`
- **UAV EO/IR** 대용량 클립: `frontend/public/media/uav/eo/*.mp4`, `.../ir/*.mp4` (배포는 빌드 파이프라인·정적 호스팅에서 별도 업로드하거나 팀 공유물 사용)
- 대용량 **체크포인트·데이터·zip**

푸시 전 `git status`로 민감 파일이 없는지 확인하세요.

---

## 라이선스

프로젝트 내부 정책에 따릅니다. 서브모듈·데이터셋(예: VoD 원본)은 각각의 라이선스를 따릅니다.

---

## 관련 링크

- 원격 저장소: GitHub `pbzz1/hanhwa_final` (원격 이름은 `origin`으로 설정된 경우가 많습니다.)
- 기능 브랜치 작업 후 **`master`/`main` 병합**은 Pull Request로 진행하는 것을 권장합니다.
