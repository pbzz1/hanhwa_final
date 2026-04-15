# 웹 테스트 매뉴얼 (실시간 전장판)

> 대상 화면: **`/`** — `frontend/src/App.tsx`의 **`BattlefieldServicePage`**  
> 시나리오 상태: `frontend/src/battlefield/battlefieldScenarioPhase.ts`의 **`BattlefieldScenarioPhase`**  
> SAR-2 권역 GeoJSON: `frontend/src/battlefield/sarMvp/sarDetections.ts`의 **`SAR_OBSERVATION_ZONE_GEOJSON`** (속성 `name: 'SAR-2 광역 관측 지역'`)  
> 지도 레이어: `SERVICE_SAR2_ZONE_FILL_LAYER_ID` / `SERVICE_SAR2_ZONE_LINE_LAYER_ID` — 붉은 반투명 면 + **점선 테두리** (`line-dasharray: [2, 1]`, `line-color: #fecaca`)

---

## 0. 사전 준비

| 항목 | 내용 |
|------|------|
| **실행** | 루트에서 `npm run dev` (또는 `npm run install:all` 후) — 프론트 기본 **5173**, 백엔드 **3308** (`backend/src/main.ts`, `frontend/vite.config.ts` 프록시). |
| **접속 URL** | 브라우저에서 `http://localhost:5173` (또는 Vite가 안내한 주소). |
| **DB** | MySQL + Prisma 마이그레이션·시드 적용 후 지도 자산 API가 동작해야 함 (`GET /map/units` 등). 시드 계정: `backend/prisma/seed.ts` — 예: **`demo@hanhwa.local` / `Demo1234!`**. |
| **로그인 후 이동** | 로그인 성공 시 기본 경로 **`/`** (실시간 전장판). 사이드바 **「실시간 전장판」** (`AppLayout`의 `NavLink to="/"`). |

---

## 1. 웹 접속 → 로그인

### 1.1 웹 접속

1. 브라우저에서 프론트 개발 서버 주소로 접속합니다. (예: `http://localhost:5173`)

### 1.2 로그인

1. 비로그인 상태에서 보호 라우트 접근 시 **`/login`**으로 이동할 수 있습니다. (`RequireAuth` → `Navigate to="/login"`)
2. **`LoginPage`**에서 이메일·비밀번호 입력 후 로그인합니다.  
   - 시드 계정 예: **`demo@hanhwa.local`** / **`Demo1234!`** (`frontend/src/App.tsx`의 `LoginPage` 기본값과 `backend/prisma/seed.ts` 일치).
3. 성공 시 **`/`** 로 이동하고, 상단 바에 사용자 이메일이 표시됩니다.

**기대 결과**

- `localStorage`에 **`accessToken`** 저장.
- `GET /auth/me`로 사용자 정보 복구 후 **실시간 전장판** 렌더.

---

## 2. 작전 구역 선택

초기 시나리오 단계는 **`BattlefieldScenarioPhase.IDLE`** 입니다.  
작전 구역 확정 후 **`REGION_SELECTED`** 로 바뀌며, 안내 문구 **`BATTLEFIELD_SCENARIO_NOTICES.regionSelected`** 가 표시됩니다.  
(`frontend/src/battlefield/battlefieldScenarioMock.ts`)

### 방법 A — 주 버튼(권장)

1. 좌측 시나리오 패널에서 **상단 주요 CTA**가 **`작전 구역 선택`** 인지 확인합니다. (`primaryScenarioCta` — `scenarioPhase === IDLE`)
2. **`작전 구역 선택`** 버튼을 클릭합니다.  
   - 내부적으로 **`selectOperationRegion()`** 호출 (`handlePrimaryScenarioAction`).
3. 지도가 **`KOREA_OPS_BOUNDS`**(한반도 근사 BBOX)에 맞게 **`fitBounds`** 됩니다. (`battlefieldScenarioPhase.ts`의 상수, 위·남위·동·서 경계)

### 방법 B — 지도 빈 곳 클릭

1. 시나리오가 **IDLE**인 상태에서, 지도의 **한반도 작전 구역 안** 빈 곳을 클릭합니다.  
   - 조건: **`isInsideKoreaOpsRegion(clickLat, clickLng)`** 가 참일 때만 **`selectOperationRegionRef.current()`** 호출 (`App.tsx` 지도 `click` 핸들러).  
   - 구역 범위: 위도 **33.9 ~ 38.9**, 경도 **124.5 ~ 131.5** (`KOREA_OPS_BOUNDS`).
2. 마커·객체 레이어 위를 클릭한 경우에는 구역 확정이 아닐 수 있습니다(다른 레이어가 팝업 닫기용 목록에 포함됨).

**기대 결과**

- 상단/패널에 **`작전 구역이 선택되었습니다. SAR 전개를 진행하세요.`** 유형의 알림 (`regionSelected`).
- 시나리오 단계 **`REGION_SELECTED`**.
- 주요 CTA 라벨이 **`SAR 전개`** 로 바뀜 (`primaryScenarioCta`).

---

## 3. SAR 전개

1. **`REGION_SELECTED`** 상태에서 주요 CTA **`SAR 전개`** 를 클릭합니다.  
   - **`handlePrimaryScenarioAction`** → **`applySensorSimulationStep('sar')`** → **`enterSarScanPhase(undefined)`** (`App.tsx`).
2. 시나리오 단계가 **`SAR_SCAN`** 으로 전환되고, SAR 센서 시뮬 상태가 동작합니다.

**기대 결과**

- 단계 **`SAR_SCAN`** (`BATTLEFIELD_PHASE_MAP_FLAGS`에서 **`sar2Zone: true`**)  
  → 지도에 **SAR-2 광역 관측 지역** 폴리곤이 표시됩니다.  
  - 채움: `#ef4444` 반투명, 테두리: **점선** (`App.tsx` 레이어 `paint` 정의).
- **`enterSarScan`** 알림: *「함흥 방향 SAR 위성 링크 이상 감지. SAR-2 광역 관측으로 전환합니다.」* (`BATTLEFIELD_SCENARIO_NOTICES.enterSarScan`)
- GRD 반도 오버레이 등 SAR 단계용 맵 플래그가 켜짐 (`showSarGrdPeninsulaOverlay: true`).

---

## 4. SAR-2 광역 관측 지역(붉은 네모·점선) 클릭

1. 지도를 **함흥 북쪽~북동쪽** 일대로 이동·확대해, **붉은 반투명 사각형 + 옅은 붉은 점선 경계**를 찾습니다.  
   - 데이터 좌표(대략): 경도 **127.56 ~ 127.9**, 위도 **39.72 ~ 39.94** (`sarDetections.ts`의 폴리곤).
2. **사각형 면(채움 영역)** 을 클릭합니다. (`SERVICE_SAR2_ZONE_FILL_LAYER_ID`의 `click` 핸들러)
3. 호버 시에는 같은 구역에 마우스를 올리면 **툴팁 팝업**이 따라다닐 수 있습니다(`mousemove`).

**기대 결과**

- **`sarSpotlightOpen`** 이 true가 되어 **Spotlight 모달**이 포털로 열립니다. (`createPortal`, 클래스 `sar-spotlight-root`)
- 제목: **「Spotlight · SAR 관측 구역 강조」**, 본문에 **`SAR_SPOTLIGHT_MODAL_SUB`**, 이미지 **`SAR_SPOTLIGHT_RESULT_IMAGE_URL`**.
- 하단 알림: *「SAR-2 관측 지역 분석: 함흥 남하 축선 전차 통과 확률을 산출했습니다.」*
- 우측/상세 패널에 **`SAR-2 광역 관측 지역`** 제목의 **`selectedDetail`** 이 채워질 수 있습니다.

---

## 5. 창 닫기 (Spotlight 모달)

다음 중 하나로 닫습니다. (`dismissSarSpotlight` — `setSarSpotlightOpen(false)` 등)

1. 모달 우상단 **`×`** 버튼 (**`aria-label="Spotlight 닫기"`**).
2. 모달 바깥 **어두운 배경** (`sar-spotlight-backdrop`) 클릭.
3. Spotlight가 열린 상태에서 **지도 빈 곳** 클릭 시에도 닫히는 분기가 있습니다 (`sarSpotlightOpenRef.current` + `dismissSarSpotlight`).

**기대 결과**

- Spotlight DOM 제거, 시뮬/타임라인 로직과 연동된 **`sarSpotlightSeen`** 등 후속 상태 갱신.

---

## 6. 이후 각종 기능 테스트 (권장 순서)

아래는 **`BattlefieldServicePage`** 및 연결 라우트 기준입니다. 단계·게이트는 **`tryAdvancePhaseWithSensor`**, **`applySensorSimulationStep`**, **`getSensorAdvanceHint`** (`App.tsx`)와 맞춥니다.

### 6.1 시뮬 배속·타임라인

- 주요 CTA가 **`배속 xN`** 모드일 때(`primaryScenarioCta.mode === 'speed'`) **배속 순환** 버튼으로 속도 변경 (`handleCycleBattlefieldSpeed`).
- **타임라인 슬라이더**가 활성화된 구간에서 과거 스냅샷 탐색(코드상 `timelineControlEnabled`).

### 6.2 GRD(파란 이동 검출 면)

- SAR 이후 단계에서 **파란 다각형** 호버·클릭 — GRD 메타·UAV 출동 모달 조건 확인 (`SERVICE_GRD_MOTION_*` 레이어, `setUavDispatchModalOpen` 등).
- 우측 패널에서 **GRD 지도 오버레이** 토글 (`grdMotionMapOverlayOn` 등).

### 6.3 UAV

- 좌측 **`UAV`** 센서 버튼: **SAR_SCAN** 이후, 조건 충족 시에만 다음 단계로 진행.  
  - 미선택 시 안내: *「파란 GRD 검출 영역 또는 적 표적을 먼저 선택…」* (`applySensorSimulationStep` 내 `sensorId === 'uav'` 가드).
- **적 MBT 마커 클릭** → 상세·드론 타깃 설정 등 (`setDroneStrikeTarget` 연계).

### 6.4 드론

- **`UAV_DISPATCHED`** 이후 **`드론`** 버튼: **적 표적 선택 필수** 메시지 확인 가능 (`droneStrikeTargetRef` 가드).

### 6.5 FMCW

- **`DRONE_RECON`** 이후 **`FMCW`** — 근거리 레이더 시뮬·요약 모달·예측 경로 토글 (`fmcwPredictionRouteOn`, `fmcwCoverageOn` 등).

### 6.6 시나리오 완료 / 재시작

- **`FMCW_ANALYSIS`** 에서 주요 CTA **`시나리오 완료`** → **`SCENARIO_COMPLETE`**.
- 완료 후 **`시나리오 다시 시작`** → **`handleResetScenario`** 로 IDLE 복귀.

### 6.7 위험 오버레이·실험 패널

- **`useRiskFilters`** / **`ExperimentModePanel`** — 파이프라인 모드·Top-K·비교 모드 변경 시 지도 **`RiskOverlayLayer`** 갱신.
- 후보 클릭 시 **`handleSelectRiskCandidate`** — 지도 `easeTo` 이동.

### 6.8 다른 페이지(회귀)

- 사이드바: **시나리오 재생** → **`/scenario-playback`** (`HomePage`, 카카오맵 시뮬).
- **전차 식별·추적** → **`/identification`** (`POST /ai/yolo/*`, JWT).
- **센서 파이프라인** → **`/sensor-pipeline`** (`?step=fmcw` 등).
- **드론 EO/IR** → **`/drone-eo-ir`**.

---

## 7. 테스트 체크리스트 (요약)

| # | 절차 | 기대 |
|---|------|------|
| 1 | `/` 접속·로그인 | 토큰·사용자 표시 |
| 2 | **작전 구역 선택** (버튼 또는 한반도 BBOX 내 빈 지도 클릭) | `REGION_SELECTED`, 안내 문구 |
| 3 | **SAR 전개** | `SAR_SCAN`, 붉은 SAR-2 구역·GRD 오버레이 등 |
| 4 | SAR-2 **면** 클릭 | Spotlight 모달 오픈 |
| 5 | **×** 또는 배경 클릭으로 모달 닫기 | 모달 종료 |
| 6 | UAV→드론→FMCW 순 또는 위험/배속 등 | 단계·알림·레이어 일치 |

---

## 8. 문제 발생 시

| 현상 | 확인 |
|------|------|
| 로그인 실패 | 백엔드 기동, DB 시드, `DATABASE_URL` |
| API 404/프록시 오류 | `frontend/vite.config.ts`의 `/auth`, `/map`, `/ai` 프록시, 백엔드 포트 **3308** |
| SAR-2 박스가 안 보임 | 반드시 **`SAR_SCAN`** 이후인지 (`REGION_SELECTED`만으로는 `sar2Zone: false`) |
| 구역 클릭이 안 먹음 | **IDLE**에서만 한반도 BBOX 빈 클릭 유효; 자산/레이어 위 클릭은 제외될 수 있음 |
| OSRM 경로 지연 | 공개 OSRM 한계 — 시간 두고 재시도 또는 `backend` 환경 변수 `OSRM_BASE_URL` |

---

## 9. 근거 파일 빠른 찾기

| 내용 | 파일 |
|------|------|
| 시나리오 단계·한반도 BBOX | `frontend/src/battlefield/battlefieldScenarioPhase.ts` |
| 단계별 지도 플래그·알림 문구 | `frontend/src/battlefield/battlefieldScenarioMock.ts` |
| SAR-2 폴리곤·이름 | `frontend/src/battlefield/sarMvp/sarDetections.ts` |
| 작전 구역/SAR CTA·지도 클릭·SAR2 클릭·Spotlight | `frontend/src/App.tsx` (`BattlefieldServicePage` 구간) |

---

*본 매뉴얼은 위 파일의 동작을 기준으로 작성되었습니다. UI 문구가 빌드마다 미세하게 바뀔 수 있으니, 실제 화면의 버튼 라벨과 함께 사용하세요.*
