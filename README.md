# hanhwa_final

한반도 전장을 가정한 **지휘·통제(C2) 데모 웹**, **NestJS API**, **Prisma(PostgreSQL)**를 한 저장소에서 다루는 모노레포입니다.  
시연용으로 **지도·시나리오·센서(SAR/UAV/드론/FMCW)·위험 오버레이**를 연결하고, 백엔드·프론트 중심으로 운용할 수 있도록 구성되어 있습니다.

## 저장소 구성

| 경로 | 설명 |
|------|------|
| **`frontend/`** | React 19 + Vite + TypeScript. MapLibre 지도, 시나리오 UI, 위험 E2E 시각화 등. 엔트리: `frontend/src/main.tsx`, 메인 라우트·전장 로직: `frontend/src/App.tsx`. |
| **`backend/`** | NestJS 11 REST API. 인증(`auth`), 지도·레이더·전술(`map`), AI 프록시(`ai`). Prisma: `backend/prisma/schema.prisma`. |
| **`radar-service/`** | VoD 형식 FMCW `.bin` 단독 처리 파이프라인(탐지·추적·위험 등). `radar-service/README.md`. |
| **`scripts/`** | 루트 `npm run dev`용 포트 정리, `dev:all` 시 radar-service 기동 스크립트. |

---

## 기술 스택 요약

| 영역 | 사용 기술 |
|------|-----------|
| 프론트 | React 19, Vite 7, TypeScript, react-router-dom, **maplibre-gl**, mgrs |
| 백엔드 | NestJS 11, Prisma 6, PostgreSQL, JWT(passport-jwt), bcrypt, class-validator |
| 외부 HTTP(데모) | OSRM 도로 경로(`backend/src/map/map-routing.service.ts`) |
| Radar | Python FastAPI(`radar-service`) |


### 대용량을 꼭 버전 관리하고 싶다면

- [Git LFS](https://git-lfs.com/)로 특정 확장자만 LFS 대상으로 지정할 수 있습니다. 저장소·조직의 LFS 할당량을 확인하세요.
- 대용량 원본 데이터·학습 가중치 등은 별도 아티팩트 저장소에 보관하는 것을 권장합니다.


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
