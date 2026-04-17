# 한화 파이널 프로젝트 — 포트폴리오·발표·면접용 가이드

> 본 문서는 **현재 저장소의 실제 코드·파일**을 기준으로 작성되었습니다.  
> 경로·함수명·API·상태명은 코드와 맞추었으며, 개인 기여도 비율은 코드만으로 판단할 수 없으므로 **면접 답변 예시는 본인 경험에 맞게 수정**하세요.

---

# 1. 프로젝트 한 줄 요약

| 구분 | 내용 |
|------|------|
| **무엇을 하는가** | 한반도 전장을 가정한 **지도·시나리오·센서·AI 추론을 한 흐름으로 보여 주는 웹 애플리케이션**입니다. 프론트는 **React(Vite)**, API는 **NestJS + Prisma(MySQL)**, 영상·레이더 심층 추론은 **별도 Python(`ai-inference`)**으로 이어집니다. |
| **사용자가 보는 기능** | 로그인 후 **실시간 전장판(지도)**, **시나리오 재생(단계·타임라인)**, **YOLO 이미지/동영상 업로드**, **웹캠 모니터**, **센서 파이프라인 안내 UI**, **드론 EO/IR 전용 페이지**, (지도 위) **위험 후보 오버레이·실험 패널** 등을 씁니다. |
| **핵심 목적** | **“센서 → 상황 인지 → 지도 표현 → (선택) AI/도로 기반 근거 → 의사결정 기록”**을 데모·발표 가능한 하나의 제품 흐름으로 묶는 것입니다. |

---

# 2. 전체 구조 개요

## 2.1 레이어별 구분

| 레이어 | 경로·역할 |
|--------|-----------|
| **프론트엔드** | `frontend/` — Vite, React 19, TypeScript, `react-router-dom`, `maplibre-gl`, `mgrs` 등 (`frontend/package.json`). |
| **백엔드 API** | `backend/` — NestJS 11, 전역 `ValidationPipe`, CORS, 모듈: `AuthModule`, `PrismaModule`, `AiModule`, `MapModule` (`backend/src/app.module.ts`, `backend/src/main.ts`). |
| **데이터** | MySQL + Prisma 스키마 `backend/prisma/schema.prisma` — 예: `User`, `Unit`, `InfiltrationPoint`, `Media`, `InferenceResult`. 데모 데이터는 `backend/prisma/seed.ts`. |
| **외부 HTTP** | **OSRM** — `backend/src/map/map-routing.service.ts`에서 `fetch`로 `route/v1/driving/...` 호출. **Python AI** — `backend/src/ai/ai.service.ts`의 `AI_INFERENCE_URL`(기본 `http://localhost:8001`). |
| **인증** | **JWT** — `backend/src/auth/auth.module.ts`의 `JwtModule.register`, `passport-jwt`의 `JwtStrategy` (`backend/src/auth/jwt.strategy.ts`). 프론트는 **`localStorage` 키 `accessToken`** (`frontend/src/App.tsx`의 `App`). |
| **연구/오프라인 파이프라인** | `vod-devkit/` — 예: `vod-devkit/21_vod_hybrid_risk_pipeline_e2e_runall.ipynb` (위험·클러스터·suppression 등 실험 문서형 노트북). 웹의 위험 목 데이터와 **개념적으로 연결**될 수 있으나, 웹이 노트북을 직접 호출하지는 않습니다. |

## 2.2 폴더 역할 (요약)

- **`frontend/src/`** — UI 본체. 특히 **`frontend/src/App.tsx`**에 라우트·다수 페이지·대형 지도/시뮬 로직이 집중.
- **`frontend/src/components/app/`** — `AppShell`, `MapStage`, `ScenarioSidebar`, `ExperimentModePanel`, `RightInfoPanel` 등 레이아웃 조각.
- **`frontend/src/components/risk/`**, **`frontend/src/hooks/`** — 위험 UI·GeoJSON (`useRiskGeoJson`, `RiskOverlayLayer` 등).
- **`frontend/src/battlefield/`** — 시나리오 위상(`battlefieldScenarioPhase.ts`), SAR/UAV/FMCW MVP, **`enemyOsrmMarch.ts`**의 OSRM URL 조합 등.
- **`frontend/src/mock/riskZoneE2EMock.ts`** — 위험 후보 **목업 데이터**.
- **`backend/src/auth/`**, **`backend/src/map/`**, **`backend/src/ai/`**, **`backend/src/prisma/`** — REST·DB·AI 프록시.
- **`ai-inference/`**, **`radar-service/`** — 루트 `package.json`의 `dev:all`이 `scripts/run-ai-server.mjs`, `scripts/run-radar-service.mjs`로 기동 가능한 Python 서비스.
- **`vod-devkit/`** — VoD·위험 파이프라인 노트북·스크립트.

## 2.3 엔트리 → 실행 흐름

1. **엔트리** — `frontend/src/main.tsx`: `createRoot` → `BrowserRouter` → `App`.
2. **앱 루트** — `frontend/src/App.tsx`의 `App`: `useState`로 `token`(`localStorage.getItem('accessToken')`), `user`, `authReady` 초기화 후 `token`이 있으면 `GET ${getApiBaseUrl()}/auth/me` + `Authorization: Bearer`.
3. **라우팅** — 같은 파일 하단 `Routes`/`Route`: 인증 구역은 `RequireAuth` → `AppLayout` → `Outlet`; 로그인 구역은 `AuthLayout`.
4. **화면** — 예: `/` → `BattlefieldServicePage` (같은 `App.tsx` 내부 함수 컴포넌트).
5. **API** — `getApiBaseUrl()` (`frontend/src/apiBaseUrl.ts`): 개발 시 빈 문자열 → 브라우저는 `/map/...` 등 **동일 오리진**으로 요청 → `frontend/vite.config.ts`의 `server.proxy`가 Nest(기본 `http://127.0.0.1:3308`)로 전달.
6. **데이터 표시** — `requestJson` 또는 `fetch`로 받은 JSON을 `useState`에 넣고, 지도는 MapLibre 소스/레이어 갱신, 표는 JSX로 렌더.

### 라우트 정의 (근거 코드)

`frontend/src/App.tsx`:

```tsx
<Routes>
  <Route element={<RequireAuth user={user} authReady={authReady} />}>
    <Route element={<AppLayout user={user} onLogout={handleLogout} />}>
      <Route path="/" element={<BattlefieldServicePage />} />
      <Route path="/scenario-playback" element={<HomePage user={user} />} />
      <Route path="/identification" element={<IdentificationTrackingPage />} />
      <Route path="/monitor" element={<CameraMonitorPage />} />
      <Route path="/sensor-pipeline" element={<SensorPipelinePage />} />
      <Route path="/drone-eo-ir" element={<DroneEoIrIdentificationPage />} />
    </Route>
  </Route>
  <Route element={<AuthLayout user={user} authReady={authReady} />}>
    <Route path="/login" element={<LoginPage onLoggedIn={handleAuthSuccess} />} />
    <Route path="/signup" element={<SignupPage onSignedUp={handleAuthSuccess} />} />
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

---

# 3. 기술 스택 정리 (코드 근거)

| 기술 | 근거 파일 / 사용 방식 |
|------|------------------------|
| **TypeScript** | `frontend/`·`backend/` 전반 `.ts` / `.tsx`. |
| **React 19 + Vite** | `frontend/package.json` — `"react": "^19.2.0"`, `"dev": "vite"`. 엔트리 `frontend/src/main.tsx`. |
| **react-router-dom 7** | `main.tsx`의 `BrowserRouter`; `App.tsx`의 `Routes`, `NavLink`, `useNavigate`, `useSearchParams`. |
| **MapLibre GL** | `App.tsx` — `import maplibregl from 'maplibre-gl'`, `BattlefieldServicePage`의 `mapRef` 등. |
| **mgrs** | `App.tsx` — `latLngToMgrsSafe` 등 `mgrsUtil` import. |
| **NestJS** | `backend/package.json`, `backend/src/main.ts` — `NestFactory.create(AppModule)`. |
| **Prisma + MySQL** | `backend/prisma/schema.prisma` — `datasource db { provider = "mysql" }`. |
| **JWT + Passport** | `backend/src/auth/auth.module.ts` — `JwtModule.register`, `JwtStrategy` — `ExtractJwt.fromAuthHeaderAsBearerToken()`. |
| **bcrypt** | `backend/src/auth/auth.service.ts` — `bcrypt.hash`, `bcrypt.compare`. |
| **class-validator** | `backend/src/auth/dto/login.dto.ts`, `signup.dto.ts`; `main.ts`의 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`. |
| **OSRM(외부)** | `backend/src/map/map-routing.service.ts` — `fetch`로 OSRM 라우팅 JSON 파싱. |
| **Python AI (uvicorn)** | `scripts/run-ai-server.mjs` — `ai-inference`에서 `uvicorn main:app --port 8001`. Nest는 `AiService`에서 `fetch`로 호출. |
| **차트/캔버스(프론트)** | `App.tsx`가 `RadarCharts2D`, `TacticalRadarCanvas` 등을 import — 패키지가 아닌 **로컬 컴포넌트** 기반 시각화가 중심. |

### 왜 이런 구조인가 (코드가 말해 주는 이유)

- **Vite 프록시 + 빈 API 베이스 URL**: `frontend/src/apiBaseUrl.ts` 주석 — HTTPS/ngrok에서 mixed content를 피하고 **프론트와 API를 같은 오리진**으로 맞춤.
- **Nest가 AI 앞단**: `AiController`는 JWT로 보호하고, 파일 업로드를 받아 **`AiService`가 `AI_INFERENCE_URL`로 전달** — 브라우저가 Python 포트를 직접 알 필요 감소·보안·CORS 단순화.
- **`source=live` 레이더**: `MapService.getRadarSnapshot`이 합성 스냅샷 위에만 AI를 얹어 **“항상 동작하는 데모”와 “실데이터 느낌”을 분리** (`backend/src/map/map.service.ts`).

---

# 4. 주요 기능별 상세 분석

아래는 **저장소에 실제로 존재하는 기능**만 다룹니다.

## 4.1 로그인 / 회원가입 / 인증 복구

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 이메일·비밀번호 제출 → 성공 시 메인으로 이동. 새로고침 시 잠시 “인증 상태 확인 중…”. |
| **관련 파일** | `frontend/src/App.tsx` (`LoginPage`, `SignupPage`, `RequireAuth`, `AuthLayout`, `App`), `frontend/src/apiBaseUrl.ts`, `backend/src/auth/auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, `auth.module.ts` |
| **핵심** | API: `POST /auth/login`, `POST /auth/signup`, `GET /auth/me`. 상태: `token`, `user`, `authReady`. 저장: `localStorage.setItem('accessToken', payload.accessToken)` (`handleAuthSuccess`). |
| **데이터 흐름** | 로그인 응답 `AuthResponse` → 토큰 저장 → `useEffect([token])`에서 `/auth/me` → `setUser`. 실패 시 `removeItem('accessToken')`. |
| **포트폴리오 포인트** | “SPA에서 **토큰 + `/auth/me`로 서버 권위 사용자 정보**를 맞춘 전형 패턴”이라고 설명 가능. |
| **잘한 점** | `RequireAuth` / `AuthLayout`으로 **로그인 여부에 따른 분기**가 라우트 레벨에서 명확. |
| **아쉬운 점** | `jwt.strategy.ts`에 `process.env.JWT_SECRET \|\| 'dev-only-secret'` — **운영 시 반드시 환경 변수**로 대체해야 함. |

## 4.2 지도 시각화 (실시간 전장판)

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 지도 줌/이동, 레이어·자산 클릭, 센서 시뮬·모달 등. |
| **관련 파일** | `frontend/src/App.tsx` (`BattlefieldServicePage`, `maplibregl` ref 다수), `frontend/src/components/app/AppShell.tsx`, `MapStage.tsx`, `ScenarioSidebar.tsx` 등 |
| **핵심** | `mapContainerRef`, `mapRef`, `mapReady`, `layerVisible` 등 상태; `AppShell`은 `className`만 감싸는 얇은 레이어 (`AppShell.tsx`). |
| **데이터 흐름** | `GET /map/units`, `GET /map/infiltrations`로 Prisma 엔티티 로드 → 마커/레이어에 반영 (`requestJson` 호출 패턴). |
| **포트폴리오 포인트** | “**DB 기반 전술 자산**을 지도에 올린 C2 UI”라고 말할 수 있음 (`backend/prisma/seed.ts`가 좌표·부대 정보 제공). |
| **잘한 점** | MapLibre + GeoJSON 패턴으로 **위험 오버레이** 등 확장 (`RiskOverlayLayer.tsx`). |
| **아쉬운 점** | 지도·시뮬 코드가 **`App.tsx`에 과집중** — 유지보수 난이도 큼. |

## 4.3 시나리오 재생 (`HomePage`)

| 항목 | 내용 |
|------|------|
| **사용자 동작** | URL `?scenario=1..5`로 단계, 타임라인 재생, 카카오맵 메인+인셋, UAV·드론·전술 UI 등. |
| **관련 파일** | `frontend/src/App.tsx` (`HomePage`, `useSearchParams`의 `scenario` 파싱) |
| **핵심 상태** | `friendlyUnits`, `enemyInfiltrations`, `simProgress`, `simPaths`, `radarSnapshot`, `scenarioStep`, `tacticRecommendations`, `selectedTacticUnit` 등. |
| **API** | `/map/units`, `/map/infiltrations`, `/map/radar/snapshot?source=live`, OSRM 경유 `/map/route/driving`, `scenarioStep === 5`일 때 `GET /map/tactics/recommendations?scenarioKey=battalion-reconstructed-v1`, `POST /map/tactics/decision`. |
| **데이터 흐름** | DB 유닛 로드 → **합성 궤적 즉시 표시** → `buildRoadAwareSimPaths`가 OSRM으로 **도로 궤적으로 교체** 시도 (`fetchRoadRoundTripPath`, `fetchRoadInvasionPath` 등이 `getApiBaseUrl()` 기반 URL 사용). |
| **포트폴리오 포인트** | “**스토리텔링 UI + REST로 의사결정 로그 저장**”을 같이 보여 줌. |
| **잘한 점** | 인셋 `setBounds`를 `simProgress` 매번이 아니라 **특정 tick에만** 갱신하려는 주석·의존성 설계. |
| **아쉬운 점** | 공개 OSRM 의존 — 지연·실패 시 폴백은 있으나 **운영 SLA**는 별도 인프라 필요. |

## 4.4 위험지역 오버레이 (E2E 목 + 실험 UI)

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 실험 패널에서 파이프라인 모드·알고리즘·Top-K 등 변경 → 지도 폴리곤/트랙·목록이 변함. 후보 클릭 시 `map.easeTo`로 이동 (`handleSelectRiskCandidate`). |
| **관련 파일** | `frontend/src/mock/riskZoneE2EMock.ts`, `frontend/src/hooks/useRiskFilters.ts`, `useTopRiskCandidates.ts`, `useRiskGeoJson.ts`, `frontend/src/components/risk/RiskOverlayLayer.tsx`, `ExperimentModePanel.tsx`, `App.tsx` 내 `useRiskFilters` 등 |
| **핵심** | 상수 `RISK_ZONE_E2E_MOCK`, 상태 `riskState` (`DEFAULT_RISK_UI_STATE`: `showRiskZones`, `pipelineMode`, `riskScoreMode`, `clusterAlgoMode`, `topKMode` 등). |
| **데이터 흐름** | 목 데이터 → `useTopRiskCandidates`로 필터/정렬 → `useRiskGeoJson`이 GeoJSON 생성 → `RiskOverlayLayer`가 소스 ID `risk-e2e-zone-source`, `risk-e2e-track-source`로 MapLibre에 추가. |
| **포트폴리오 포인트** | “**오프라인 파이프라인 산출물을 UI 계약(GeoJSON·필터)으로 재현**”했다고 설명 (실제 백엔드 위험 API는 이 경로에 없음). |
| **잘한 점** | `match`/`interpolate`로 **위험 등급별 스타일**을 맵 스펙에 직접 표현 (`RiskOverlayLayer.tsx`). |
| **아쉬운 점** | **목업**이므로 “실운영 데이터 연동”과 구분해 말해야 함. |

## 4.5 적 이동 경로 표시 (OSRM + 폴백)

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 시나리오/전장에서 적이 **도로를 따라 이동**하는 시연. |
| **관련 파일** | `frontend/src/battlefield/enemyOsrmMarch.ts` (`drivingRouteRequestUrl`, `fallbackStraightMarchPolyline` 등), `frontend/src/App.tsx`, `backend/src/map/map.controller.ts` `getDrivingRoute`, `map-routing.service.ts` |
| **핵심 API** | `GET /map/route/driving?fromLat=&fromLng=&toLat=&toLng=` → `{ coordinates: { lat, lng }[] }`. |
| **데이터 흐름** | Nest가 OSRM에 요청 → 좌표열 반환 → 프론트가 polyline/진행률에 사용; 실패 시 `fallbackStraightMarchPolyline` 등으로 대체. |
| **포트폴리오 포인트** | “**백엔드에서 OSRM을 감싸** 프론트는 항상 같은 도메인의 `/map`만 호출” — BFF 역할. |
| **잘한 점** | 타임아웃·에러 처리가 `MapRoutingService`에 캡슐화. |
| **아쉬운 점** | 외부 OSRM rate limit / 한국 도로 정확도 한계 — 자체 OSRM/상용 길찾기로 교체 주석에 이미 언급됨. |

## 4.6 FMCW / VoD live 연동

| 항목 | 내용 |
|------|------|
| **사용자 동작** | `?source=live` 스냅샷이 붙은 화면에서 **실파이프라인 배지** 또는 실패 메시지 확인. |
| **관련 파일** | `backend/src/map/map.controller.ts` (`getRadarSnapshot`), `backend/src/map/map.service.ts` (`getRadarSnapshot`), `backend/src/ai/ai.service.ts` (`inferVodRadarFusionAuto`), `frontend/src/App.tsx` (`SensorPipelineRadarLivePanel`, `HomePage`의 radar `useEffect`) |
| **핵심** | `getRadarSnapshot`: 기본은 `buildSyntheticRadarSnapshot()`만; `options.live`이면 `aiService.inferVodRadarFusionAuto(options.seed)`로 탐지 목록 등을 덮어씀. 응답에 `fmcw.meta.liveRun` (`ok`, `error`, `frameId`, `inferMs` 등). |
| **데이터 흐름** | 브라우저 `GET /map/radar/snapshot?source=live` → Nest → (로컬 VoD 루트에서 프레임 선택 후) Python `POST .../infer/vod/radar-fusion` — `AiService` 주석·구현 참고. |
| **포트폴리오 포인트** | “**합성 데모는 항상 응답**, live는 **데이터셋+AI 서버가 있을 때만** 실제 파이프라인” 이원화. |
| **잘한 점** | live 실패 시에도 **합성 스냅샷 베이스**로 UI가 깨지지 않게 설계. |
| **아쉬운 점** | `VOD_DATASET_ROOT` / 동기 프레임 등 **환경 구축 비용**이 큼 (`ai.service.ts` 주석). |

## 4.7 YOLO 이미지·영상 추론

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 파일 선택 → 추론 → base64 이미지·표로 결과 확인 (`IdentificationTrackingPage`). |
| **관련 파일** | `frontend/src/App.tsx` (`IdentificationTrackingPage`), `backend/src/ai/ai.controller.ts`, `backend/src/ai/ai.service.ts` |
| **핵심 API** | `POST /ai/yolo/image`, `POST /ai/yolo/video` — 컨트롤러 클래스에 `@UseGuards(JwtAuthGuard)`. 프론트는 `FormData` + `Authorization: Bearer ${localStorage.getItem('accessToken')}`. |
| **데이터 흐름** | 브라우저 → Nest(멀티파트) → `AiService.forwardFile('/infer/image' \| '/infer/video', ...)` → Python. |
| **포트폴리오 포인트** | “**인증된 업로드만 AI로 전달**”하는 게이트웨이. |
| **잘한 점** | JWT로 `/ai/*` 일괄 보호. |
| **아쉬운 점** | 대용량 영상 UX(진행률·청크)는 기본 수준일 수 있음. |

## 4.8 센서 파이프라인 페이지

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 단계 레일 클릭, `?step=sat_sar|uav_sar|fmcw|drone`, 자동 순환(4.5초). |
| **관련 파일** | `frontend/src/App.tsx` (`SensorPipelinePage`, `SENSOR_PIPELINE_STEPS`, `SensorPipelineRadarLivePanel`) |
| **핵심** | FMCW 단계만 `requestJson(\`${getApiBaseUrl()}/map/radar/snapshot?source=live\`)`. 나머지 단계는 CSS/플레이스홀더·동영상 등 UI 연출. |
| **포트폴리오 포인트** | “기술 스택을 **교육용 내비게이션**으로 압축”했다고 설명. |
| **잘한 점** | URL 쿼리로 **딥링크** (`useEffect`에서 `searchParams.get('step')` 매핑). |
| **아쉬운 점** | SAR/UAV 뷰는 **실 알고리즘 출력이 아님** — 발표에서 용어 구분 필요. |

## 4.9 전술 추천 저장

| 항목 | 내용 |
|------|------|
| **사용자 동작** | 시나리오 5단계에서 추천 목록 확인 → 부대 선택 → 저장. |
| **관련 파일** | `frontend/src/App.tsx` (`handleSaveTacticDecision`, `scenarioStep === 5`일 때 recommendations 로드 effect), `backend/src/map/map.controller.ts`, `backend/src/map/map.service.ts` (`getTacticRecommendations`, `saveTacticDecision`) |
| **핵심 API** | `GET /map/tactics/recommendations?scenarioKey=...`, `POST /map/tactics/decision` (body: `scenarioKey`, `selectedUnitName`, `suitabilityPct`, `note`, `source`, `rawPayload`). |
| **데이터 흐름** | Raw SQL로 `tactical_recommendation_profiles` 시드 후 SELECT; 저장 시 INSERT + 마지막 id 반환 (`saveTacticDecision`). |
| **포트폴리오 포인트** | “지휘관 선택을 **감사 가능한 로그**로 남김”. |
| **아쉬운 점** | Prisma 모델이 아닌 `$executeRawUnsafe` — 스키마·타입 안전성이 약함. |

## 4.10 드론 EO/IR 전용 페이지

| 항목 | 내용 |
|------|------|
| **사용자 동작** | EO/IR 설명·데모 영상 시청, 다른 페이지로 링크 이동. |
| **관련 파일** | `frontend/src/DroneEoIrIdentificationPage.tsx` (`DroneEoIrIdentificationPanel`, `DroneEoIrIdentificationPage`), `frontend/src/SensorStagePipelineFrame.tsx` |
| **핵심** | `DroneEoIrIdentificationPage`는 `<DroneEoIrIdentificationPanel embedded={false} pageClassName="drone-eoir-page" />`. 데모 영상 `DEMO_EOIR_VIDEO = '/media/drone/china-type99.mp4'`. |
| **데이터 흐름** | 정적 콘텐츠 + `<NavLink to="/sensor-pipeline?step=drone" />` 등 **클라이언트 내비게이션**. |
| **포트폴리오 포인트** | “같은 패널을 **시나리오 임베드용(`embedded`)**과 **전용 라우트**로 재사용”. |
| **잘한 점** | `SensorStagePipelineFrame`으로 **공통 스테이지 UI** 재사용. |
| **아쉬운 점** | 실시간 드론 스트림 연동은 이 페이지 범위 밖(모니터는 `/monitor`). |

## 4.11 (연구) VoD 하이브리드 위험 파이프라인 노트북

| 항목 | 내용 |
|------|------|
| **사용자 동작** | Jupyter에서 섹션별 실행·결과를 `results/`에 저장 (노트북 서두 명시). |
| **관련 파일** | `vod-devkit/21_vod_hybrid_risk_pipeline_e2e_runall.ipynb` |
| **핵심** | Section 가이드: clustering, suppression, tracking, rule risk, anti-leakage, hybrid score, ranking 등 **실험 보고서형** 구조. |
| **데이터 흐름** | 노트북 내부 — 웹 API와 직접 연결되지 않음; 다만 **프론트 `RISK_ZONE_E2E_MOCK`이 설명하는 “E2E 위험” 개념과 발표에서 연결** 가능. |
| **포트폴리오 포인트** | “웹은 **운영 UX 목업**, 노트북은 **재현 가능한 평가 파이프라인**” 이중 자산. |

---

# 5. 화면 단위 분석

| 라우트 | 컴포넌트 | 목적 | 사용자 행동 | 주요 상태·API | 발표 소개 팁 |
|--------|----------|------|-------------|---------------|-------------|
| `/login` | `LoginPage` | 인증 | 폼 제출 | `POST /auth/login` | 데모 계정 `demo@hanhwa.local` (`LoginPage` 기본 state) |
| `/signup` | `SignupPage` | 가입 | 폼 제출 | `POST /auth/signup` | DTO 검증 설명 |
| `/` | `BattlefieldServicePage` | 통합 전장판 | 지도·센서·위험 UI | `/map/units`, `/map/infiltrations`, OSRM, 위험은 mock | “메인 허브” |
| `/scenario-playback` | `HomePage` | 대대 재구성 시나리오 | `?scenario=`, 재생 | 위 + radar live + tactics | “스토리 + 의사결정 저장” |
| `/identification` | `IdentificationTrackingPage` | YOLO | 파일 업로드 | `/ai/yolo/image`, `/ai/yolo/video` | “게이트웨이 뒤 AI” |
| `/monitor` | `CameraMonitorPage` | 웹캠 | 장치·스트림 | `navigator.mediaDevices` | “현장 센서 개념” |
| `/sensor-pipeline` | `SensorPipelinePage` | 파이프라인 안내 | 스텝·autoplay | FMCW 스텝만 `/map/radar/snapshot?source=live` | “교육용 동선” |
| `/drone-eo-ir` | `DroneEoIrIdentificationPage` | EO/IR 전용 | 영상·링크 | 정적 + 내부 라우팅 | “4단계 근접 식별” |

**레이아웃**: 인증 후 `AppLayout` — 사이드바에 `NavLink to="/"`, `to="/scenario-playback"`만 고정 (`App.tsx`). 다른 페이지는 콘텐츠 안 `NavLink`로 연결.

---

# 6. 데이터 흐름 분석

## 6.1 로그인 후 인증

1. `LoginPage` — `requestJson(\`${getApiBaseUrl()}/auth/login\`, { method: 'POST', body: JSON.stringify({ email, password }) })`.
2. `onLoggedIn(result)` → `localStorage.setItem('accessToken', payload.accessToken)` + `setToken`, `setUser`.
3. `App`의 `useEffect([token])` — 토큰 있으면 `GET /auth/me` + `Authorization: Bearer ${token}` → `setUser`; catch 시 토큰 삭제.
4. `RequireAuth` — `authReady`이고 `!user`면 `<Navigate to="/login" />`; 아니면 `<Outlet />`.

## 6.2 쿼리 파라미터 / 단계

- **`HomePage`**: `useSearchParams` — 키 `scenario`, 파싱 결과 `scenarioStep` `0|1|…|5`.
- **`SensorPipelinePage`**: 키 `step` → `sat_sar`/`uav_sar`/`fmcw`/`drone` → `stepIndex`.

## 6.3 지도 / 시뮬 / 레이더

- **DB → 지도**: `requestJson`으로 units/infiltrations → state → 마커/레이어.
- **OSRM → 궤적**: `GET /map/route/driving` → `coordinates` → `buildRoadAwareSimPaths` 등이 `SimPathBundle` 갱신.
- **Live 레이더**: `GET /map/radar/snapshot?source=live` → `RadarSnapshot` 타입 상태 (`radarSnapshot`, `SensorPipelineRadarLivePanel`의 `snap` 등).

## 6.4 프론트 상태 관리

- **전역 인증**: `App`의 `useState` — Context 미사용(`App.tsx` 기준).
- **페이지 로컬**: 각 페이지 함수 컴포넌트 내부 `useState`/`useRef` 다수.
- **위험 UI**: `useRiskFilters` → `riskState`, `updateRiskState`; 파생 데이터는 `useMemo`(`useTopRiskCandidates`, `useRiskGeoJson`).

## 6.5 공통 JSON 요청 (`requestJson`)

`frontend/src/App.tsx`:

```ts
async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : '요청 처리 중 오류가 발생했습니다.'
    throw new Error(message)
  }
  return data as T
}
```

---

# 7. 백엔드 / API 분석

## 7.1 기능별 엔드포인트 표

| 구분 | 메서드 | 경로 | 입력 | 출력(코드 기준) | 프론트 사용 |
|------|---------|------|------|-----------------|-------------|
| 루트 | GET | `/` | — | string | (직접 사용 빈번하진 않음) |
| 인증 | POST | `/auth/signup` | `SignupDto` | `{ accessToken, user }` | `SignupPage` |
| 인증 | POST | `/auth/login` | `LoginDto` | 동상 | `LoginPage` |
| 인증 | GET | `/auth/me` | Bearer JWT | 사용자 안전 필드 | `App` `useEffect` |
| 지도 | GET | `/map/units` | — | Prisma `Unit[]` | `BattlefieldServicePage`, `HomePage` |
| 지도 | GET | `/map/infiltrations` | — | 침투점 목록 | 동상 |
| 지도 | GET | `/map/radar/snapshot` | `source`, `seed` | `RadarSnapshotDto` | live 패널, 시나리오 |
| 지도 | GET | `/map/route/driving` | 네 좌표 쿼리 | `{ coordinates }` | OSRM 헬퍼·적 행군 |
| 전술 | GET | `/map/tactics/recommendations` | `scenarioKey` | `{ scenarioKey, recommendations }` | `HomePage` step 5 |
| 전술 | POST | `/map/tactics/decision` | JSON body | `{ ok, id, savedAt }` | `handleSaveTacticDecision` |
| AI | GET | `/ai/health` | JWT | JSON | (주로 점검) |
| AI | POST | `/ai/yolo/image` | multipart `file` | YOLO 결과 | `IdentificationTrackingPage` |
| AI | POST | `/ai/yolo/video` | multipart `file` | 비디오 요약 | 동상 |
| AI | POST | `/ai/vod/radar-fusion` | multipart | 융합 JSON | (도구/확장) |
| AI | POST | `/ai/vod/radar-fusion/auto` | `{ seed? }` | 융합 JSON | **Nest `MapService`**가 live용으로 호출 |

`AiController`는 클래스 레벨 `@UseGuards(JwtAuthGuard)`로 **위 표의 `/ai/*`는 모두 JWT 필요** (`backend/src/ai/ai.controller.ts`).

## 7.2 Request / Response 예시 (코드 기준)

**로그인**

- Request: `POST /auth/login`, `Content-Type: application/json`, body `{ "email": string, "password": string }` (`LoginDto`: `@IsEmail()`, `@MinLength(8)` on password).
- Response: `{ accessToken: string, user: { id, email, name, createdAt, updatedAt } }` (`auth.service.ts`).

**전술 저장**

- Request: `POST /map/tactics/decision`, JSON (`App.tsx`의 `body: JSON.stringify({ scenarioKey: 'battalion-reconstructed-v1', selectedUnitName, suitabilityPct, note, source: 'web-ui', rawPayload })`).
- Response: `{ ok: true, id: number, savedAt: string }` (`MapService.saveTacticDecision`).

---

# 8. 핵심 파일 TOP N (읽는 순서 포함)

| 순위 | 파일 | 왜 중요 | 이해하면 되는 것 | 초보 포인트 |
|------|------|---------|------------------|-------------|
| 1 | `frontend/src/App.tsx` | 라우트·인증·대부분 페이지·지도 시뮬 | 제품 전체 동선 | 먼저 `App` → `Routes` → `BattlefieldServicePage` 선언부 |
| 2 | `backend/src/map/map.service.ts` | 유닛·침투·**live 레이더 오케스트레이션**·전술 | 백엔드 핵심 도메인 | `getRadarSnapshot`, `getUnits`, `getTacticRecommendations` |
| 3 | `backend/src/ai/ai.service.ts` | Python AI 프록시·VoD 자동 프레임 | 서버 간 연동 | `inferVodRadarFusionAuto`, `AI_INFERENCE_URL` |
| 4 | `frontend/src/apiBaseUrl.ts` + `frontend/vite.config.ts` | 배포·터널·mixed content | 왜 상대 경로인지 | 주석을 그대로 암기 |
| 5 | `backend/prisma/schema.prisma` + `seed.ts` | DB 모델·데모 좌표 | 지도에 무엇이 찍히는지 | `Unit`, `InfiltrationPoint` |
| 6 | `frontend/src/battlefield/battlefieldScenarioPhase.ts` | 센서 단계 게이트 | 버튼 활성 조건 | `BattlefieldScenarioPhase`, `tryAdvancePhaseWithSensor` |
| 7 | `frontend/src/battlefield/enemyOsrmMarch.ts` | OSRM URL·폴백 | 적 경로 실패 시 | `drivingRouteRequestUrl` |
| 8 | `frontend/src/hooks/useRiskGeoJson.ts` + `components/risk/RiskOverlayLayer.tsx` | 목→GeoJSON→MapLibre | 위험 레이어 파이프라인 | 소스 ID 상수들 |
| 9 | `backend/src/auth/auth.service.ts` | 인증 규칙 | JWT 내용 | `createAccessToken` payload `sub`, `email` |
| 10 | `vod-devkit/21_vod_hybrid_risk_pipeline_e2e_runall.ipynb` | 오프라인 위험 실험 | 웹 mock과 **개념 연결** | Section 목차만 |

---

# 9. 발표 / 면접용 설명 문장

## 30초

“**React·Vite 전장 데모 UI**에 **Nest·Prisma**로 아군·침투 데이터를 내려주고, **JWT 로그인** 후 **MapLibre**로 상황을 그립니다. **OSRM**으로 도로 궤적을 얹고, 필요하면 **`/map/radar/snapshot?source=live`**로 **Python VoD 융합 추론**을 붙입니다.”

## 1분

“화면은 **실시간 전장판**과 **시나리오 재생**, **YOLO 업로드**, **센서 파이프라인 설명**, **드론 EO/IR** 페이지로 나뉩니다. API는 개발 시 **Vite 프록시**로 Nest에 붙어 CORS·HTTPS 이슈를 줄였습니다. 지도 데이터는 **MySQL 시드**, 전술은 **추천 GET + 결정 POST**로 남깁니다. 레이더는 **기본 합성**에 **`source=live`일 때만** AI가 탐지를 덮어씁니다.”

## 3분

1. **문제**: 센서·지도·의사결정을 한 흐름으로 보여 줘야 함.  
2. **아키텍처**: SPA + Nest BFF + Prisma + 선택적 Python AI.  
3. **프론트**: 메인 MapLibre, 시나리오는 카카오+인셋, 위험은 **mock+hooks+GeoJSON**.  
4. **백엔드**: `/auth`, `/map`, `/ai` 분리; **live 레이더는 Map이 AiService 호출**로 오케스트레이션.  
5. **연구**: `vod-devkit` 노트북으로 **anti-leakage·ranking** 등 평가 스토리 보강.  
6. **한계**: `App.tsx` 비대, raw SQL 전술 테이블, 외부 OSRM — 개선 로드맵 언급.

## “본인 역할이 뭐냐” (예시 — 실제 기여에 맞게 수정)

“저는 **프론트의 시나리오·지도 연동**과 **백엔드 지도·레이더 API**를 맞췄습니다. **`BattlefieldServicePage`/`HomePage`에서 `/map/units`·`/map/infiltrations`를 불러 지도에 올리고**, **`/map/route/driving`으로 OSRM 기반 궤적**을 얹었으며, **`getRadarSnapshot`의 live 분기**가 Python과 어떻게 이어지는지 검증했습니다.”

## 가장 어려웠던 점 (예시)

“**브라우저·HTTPS·별도 API 포트**가 섞일 때 호출이 막히는 문제.”

## 어떻게 해결했는지 (예시)

“**개발에서는 `getApiBaseUrl()`을 빈 문자열로 두고 Vite `proxy`로 `/auth`,`/map`,`/ai`를 Nest로 넘겼습니다** (`frontend/src/apiBaseUrl.ts`, `frontend/vite.config.ts`).”

## 개선하고 싶은 점 (예시)

“**`App.tsx` 분할**, **전술 테이블 Prisma화**, **자체 OSRM/캐시**, **refresh token 또는 httpOnly 쿠키** 검토.”

---

# 10. 이해 부족할 가능성이 큰 부분

| 예상 질문 | 답변 방향 | 관련 파일 |
|-----------|-----------|-----------|
| 위험 지도 데이터는 실제인가? | **프론트 목업** `RISK_ZONE_E2E_MOCK` — 백엔드 위험 API 없음. 노트북은 **연구 파이프**. | `frontend/src/mock/riskZoneE2EMock.ts`, `vod-devkit/21_vod_hybrid_risk_pipeline_e2e_runall.ipynb` |
| 왜 JWT를 localStorage에? | SPA에서 구현 단순; `/auth/me`로 검증. **XSS 리스크**는 인지하고 CSP 등과 병행 필요. | `frontend/src/App.tsx` |
| Nest와 Python 역할 분리? | Nest: **인증·DB·업로드 수신·라우팅**; Python: **무거운 추론**. live 레이더는 **Nest가 Python 호출**. | `backend/src/ai/ai.service.ts`, `backend/src/map/map.service.ts` |
| `source=live` 없으면? | **합성 스냅샷만** 반환 — AI 호출 없음. | `backend/src/map/map.service.ts` |
| 왜 MapLibre + 카카오? | **화면별**로 다른 맵 SDK 사용 (`BattlefieldServicePage` vs `HomePage`). | `frontend/src/App.tsx` |
| 전술 테이블이 Prisma에 없는 이유? | **raw SQL**로 빠른 데모 — 마이그레이션 일관성은 트레이드오프. | `backend/src/map/map.service.ts` |
| 지도 성능 이슈? | `simProgress`마다 `setBounds`하지 않도록 한 **주석 설계**가 있음 — 여전히 대형 컴포넌트는 리스크. | `frontend/src/App.tsx` (인셋 bounds effect 근처) |

---

# 11. 개선 제안

| 영역 | 제안 |
|------|------|
| **리팩터링** | `App.tsx`를 **라우트 파일 + 페이지별 모듈**로 분할 (`DroneEoIrIdentificationPage.tsx` 패턴 확장). |
| **유지보수** | 전술 프로파일/결정을 **Prisma 모델 + 마이그레이션**으로 승격, `$executeRawUnsafe` 축소. |
| **성능** | OSRM 호출 **디바운스/캐시**; MapLibre 소스 `setData`만 갱신하는지 점검. |
| **기술 부채** | 단일 거대 파일, 공개 OSRM, JWT 기본 시크릿 폴백, 위험 데이터 목·실서비스 혼동 가능성. |
| **발표 시 짧게** | “데모는 합성+목, live는 환경 있을 때만” 한 줄로 선 그으면 신뢰도 상승. |
| **개발자가 알아야 할 리스크** | raw SQL 패턴 자체에 대한 보안·유지보수 주의, localStorage XSS. |

---

# 12. 최종 요약

## 핵심 가치 3가지

1. **센서·지도·의사결정**을 하나의 사용자 여정으로 묶음.  
2. **합성/목업으로 항상 시연 가능**, **live/AI로 깊이 추가**.  
3. **Nest를 허브**로 인증·DB·외부 AI·OSRM을 일관되게 노출.

## 꼭 이해해야 할 파일 5개

1. `frontend/src/App.tsx`  
2. `backend/src/map/map.service.ts`  
3. `backend/src/ai/ai.service.ts`  
4. `frontend/src/apiBaseUrl.ts` + `frontend/vite.config.ts`  
5. `backend/prisma/schema.prisma` 및 `backend/prisma/seed.ts`

## 꼭 외울 기술 포인트 10개

1. 라우트: `/`, `/scenario-playback`, `/identification`, `/monitor`, `/sensor-pipeline`, `/drone-eo-ir`, `/login`, `/signup`  
2. `localStorage` 키: `accessToken`  
3. 복구: `GET /auth/me` + `Bearer`  
4. 지도 데이터: `GET /map/units`, `GET /map/infiltrations`  
5. 도로: `GET /map/route/driving`  
6. Live 레이더: `GET /map/radar/snapshot?source=live`  
7. 전술: `GET /map/tactics/recommendations`, `POST /map/tactics/decision`  
8. YOLO: `POST /ai/yolo/image`, `POST /ai/yolo/video` (JWT)  
9. 개발 프록시: `/auth`, `/map`, `/ai` → Nest  
10. 위험 UI: `RISK_ZONE_E2E_MOCK` + `useRiskGeoJson` + `RiskOverlayLayer`

## 발표 전에 다시 볼 한 줄

**“Vite+React가 지도·시나리오를 그리고, Nest+Prisma가 아군·적·전술을 주며, 옵션으로 Nest가 Python에 VoD 프레임을 넘겨 FMCW live를 얹는다.”**

---

*문서 생성: 저장소 분석 기준. 경로는 Windows에서도 동일하게 `docs/PORTFOLIO_AND_INTERVIEW_GUIDE.md`로 열람 가능합니다.*
