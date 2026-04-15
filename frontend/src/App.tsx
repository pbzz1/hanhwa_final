import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent,
} from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import { DroneEoIrIdentificationPage, DroneEoIrIdentificationPanel } from './DroneEoIrIdentificationPage'
import { RadarCharts2D } from './RadarCharts2D'
import { AirborneSarPage } from './AirborneSarPage'
import { FmcwRadarIntroPage } from './FmcwRadarIntroPage'
import { FmcwPipelineGuide } from './FmcwPipelineGuide'
import { ScenarioFlowOverview } from './ScenarioFlowOverview'
import { UavSarPage } from './UavSarPage'
import { TacticalPhaseDashboard } from './TacticalPhaseDashboard'
import { TacticalRadarCanvas } from './TacticalRadarCanvas'
import { computeSchematicBounds, TacticalSchematicMap } from './TacticalSchematicMap'
import {
  bearingDeg,
  computeRadarTargetMetrics,
  isEnemyInRadarCoverage,
  type RadarSite,
} from './radarGeo'
import {
  formatLatLngReadout,
  formatLatLngWithMgrsReadout,
  latLngToMgrsSafe,
} from './mgrsUtil'
import {
  BattlefieldScenarioPhase,
  isInsideKoreaOpsRegion,
  KOREA_OPS_BOUNDS,
  phaseAtLeast,
  tryAdvancePhaseWithSensor,
  type BattlefieldSensorId,
} from './battlefield/battlefieldScenarioPhase'
import {
  BATTLEFIELD_MBT_MARCH_GOALS,
  buildCumulativeM,
  drivingRouteRequestUrl,
  fallbackStraightMarchPolyline,
  isEnemyMarchLandPolyline,
  positionAlongPolylineM,
  type MarchPoint,
} from './battlefield/enemyOsrmMarch'
import {
  BATTLEFIELD_PHASE_MAP_FLAGS,
  BATTLEFIELD_PHASE_PANEL,
  BATTLEFIELD_SCENARIO_NOTICES,
  GRD_DISPATCH_RANGE_KM,
  SERVICE_SENSOR_SIMULATION_FOOTNOTE,
  SERVICE_SENSOR_SIMULATION_HELP,
  GRD_FALLBACK_SAR_UAV_ORIGIN,
  GRD_MOTION_DETECTIONS_GEOJSON,
  GRD_MOTION_META,
} from './battlefield/battlefieldScenarioMock'
import {
  computeGrdMotionDetectionsBounds,
  findGrdMotionIdsContainingPoint,
  parseMovementRouteTooltipProps,
  SAR_ENEMY_MOVEMENT_ROUTE_GEOJSON,
  SAR_OBSERVATION_ZONE_GEOJSON,
  SAR_SPOTLIGHT_RESULT_IMAGE_URL,
  SAR_ZONE_PASS_PROBABILITIES,
  SAR_SPOTLIGHT_MODAL_SUB,
  type SarPassProbability,
  type SarMovementRouteTooltipProps,
} from './battlefield/sarMvp'
import {
  buildUavMvpSnapshot,
  renderUavMvpPopupHtml,
  uavOpsStatusLabelKo,
  type UavMvpSnapshot,
} from './battlefield/uavMvp'
import { DRONE_ENEMY_IDENTIFICATION_RANGE_KM } from './battlefield/droneEngagementConfig'
import {
  buildDroneMvpSnapshot,
  droneMissionStatusLabelKo,
  nearestMbtEnemyDistanceKm,
  renderDroneMvpPopupHtml,
  type DroneMvpSnapshot,
} from './battlefield/droneMvp'
import {
  buildScenarioMapLabels,
  formatScenarioEnemyCompact,
  getEnemyDisplayName,
  getEnemyStatusLabel,
  getTrackLabelLong,
  resolveScenarioEnemyTrackDigits,
  type DetectionConfidence,
  type DetectionStatus,
  type EnemyCategory,
} from './battlefield/enemyPresentation'
import {
  buildFmcwMvpBundle,
  FmcwServiceDock,
  FMCW_SCENARIO_GEOJSON,
  renderFmcwRiskPopupHtml,
  type FmcwMvpBundle,
} from './battlefield/fmcwMvp'
import { buildScenarioSummaryReport } from './battlefield/scenarioSummaryMock'
import {
  BATTALION_HAMHUNG_INVASION_ORIGIN,
  BATTALION_PYONGYANG_INVASION_ORIGIN,
  BATTALION_ROUTE_CORRIDOR_REVEAL_MS,
  BATTALION_SCENARIO,
  isBattalionC2Unit,
  isEnemyNearDmz38,
  pickPrimaryEnemyForDistance,
  SAR_ENEMY_BLIP_PROGRESS,
  SAR_WIDE_SCAN_PAUSE_PROGRESS,
  SCENARIO_RANGES_KM,
  TANK_INVASION_PATH_LENGTH_THRESHOLD_KM,
  TANK_ROAD_MARCH_SPEED_KMH,
} from './scenarioBattalion'
import { AppShell } from './components/app/AppShell'
import { ExperimentModePanel } from './components/app/ExperimentModePanel'
import { MapStage } from './components/app/MapStage'
import { RightInfoPanel } from './components/app/RightInfoPanel'
import { ScenarioSidebar } from './components/app/ScenarioSidebar'
import { RiskOverlayLayer } from './components/risk/RiskOverlayLayer'
import { useRiskFilters } from './hooks/useRiskFilters'
import { useTopRiskCandidates } from './hooks/useTopRiskCandidates'
import { useRiskGeoJson } from './hooks/useRiskGeoJson'
import {
  RISK_E2E_PIPELINE_SUMMARY,
  RISK_E2E_SUPPRESSION_SUMMARY,
  RISK_ZONE_E2E_MOCK,
} from './mock/riskZoneE2EMock'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'
import './tactical-hud.css'
import { getApiBaseUrl } from './apiBaseUrl'

const SIM_STARTED_EVENT = 'hanhwa:sim-started'

type UavMissionProfileId = 'sar_eo_balanced' | 'eo_priority' | 'sar_priority'

const UAV_MISSION_PROFILES: ReadonlyArray<{
  id: UavMissionProfileId
  title: string
  detail: string
  shortTag: string
}> = [
  {
    id: 'sar_eo_balanced',
    title: 'SAR·EO 병행 (표준)',
    detail: 'SAR·EO 병행 기본 프로파일.',
    shortTag: 'SAR+EO 표준',
  },
  {
    id: 'eo_priority',
    title: 'EO·저고도 우선',
    detail: 'EO/IR 관측 비중 확대.',
    shortTag: 'EO 우선',
  },
  {
    id: 'sar_priority',
    title: 'SAR 광역 우선',
    detail: 'SAR 커버리지 우선, EO 보조.',
    shortTag: 'SAR 광역',
  },
]

/** 카카오맵 확대 수준: 숫자가 작을수록 더 확대 (API 1~14) */
const KAKAO_MAP_LEVEL_MIN = 1
const KAKAO_MAP_LEVEL_MAX = 14

type User = {
  id: number
  email: string
  name: string | null
  createdAt: string
  updatedAt: string
}

type AuthResponse = {
  accessToken: string
  user: User
}

type LoginPageProps = {
  onLoggedIn: (payload: AuthResponse) => void
}

type SignupPageProps = {
  onSignedUp: (payload: AuthResponse) => void
}

type HomePageProps = {
  user: User | null
}

type ServiceAssetCategory =
  | 'SAR'
  | 'UAV'
  | 'DRONE'
  | 'GROUND_RADAR'
  | 'DIVISION'
  | 'UPPER_COMMAND'
  | 'ARTILLERY'
  | 'ARMOR'

type ServiceSensorId = 'sar' | 'uav' | 'drone' | 'fmcw'

type ServiceAssetPoint = {
  id: number
  name: string
  lat: number
  lng: number
  unitCode: string
  category: ServiceAssetCategory
  level: UnitLevel
  formation: string
  elevationM: number
  mgrs: string
  readiness: '양호' | '경계' | '최고'
  mission: string
  situationVideoUrl: string | null
}

type ScenarioEntityRelation = 'ENEMY' | 'ALLY' | 'NEUTRAL'

type ScenarioRiskLevel = '낮음' | '중간' | '높음' | '미평가'

type ScenarioEntity = {
  id: number
  /** 우군/중립 표시명 또는 적의 관측·지역 메모(라벨 본문에는 사용하지 않음) */
  name: string
  lat: number
  lng: number
  relation: ScenarioEntityRelation
  kind: string
  /** 전술/센서 관측 요약(팝업·패널 보조 문구) */
  status: string
  speedKph: number
  headingDeg: number
  riskLevel: ScenarioRiskLevel
  /** 지도·팝업 식별번호(미설정 시 `buildScenarioEntityUnitCode`로 생성) */
  unitCode?: string
  /** 적 표적 분류 — 한글 표시명은 `enemyPresentation`에서 생성 */
  enemyCategory?: EnemyCategory
  /** 탐지/식별/추적 상태 */
  detectionStatus?: DetectionStatus
  confidence?: DetectionConfidence
  /** Track ID에 쓸 숫자 문자열(미설정 시 unitCode·id에서 유도) */
  trackId?: string
  /** GRD 기반 전차 추정(더미) — 호버 팝업에만 사용 */
  grdTankEstimate?: number
  /** GRD 위험도 점수(더미) */
  grdRiskScore?: number
}

type SelectedObjectDetail = {
  title: string
  affiliation: '적' | '아군' | '우군' | '중립'
  lat: number
  lng: number
  mgrs: string
  unitCode?: string
  summary: string
  /** DB 자산 등에서 온 표고(m). 없으면 패널에서 좌표 기반 추정 */
  elevationM?: number | null
  speedKph?: number
  headingDeg?: number
  riskLevel?: ScenarioRiskLevel
  /** UAV 마커 클릭 시 EO/IR·식별 mock */
  uavMvp?: UavMvpSnapshot
  /** 드론 마커 클릭 시 근접 정찰 mock */
  droneMvp?: DroneMvpSnapshot
}

type ScenarioTacticScore = {
  name: string
  score: number
  rationale: string
}

type LayerToggleKey = 'friendly' | 'enemy' | 'enemySymbol' | 'ally' | 'neutral'

type GoogleBasePresetId = 'hybrid' | 'satellite' | 'roadmap' | 'terrain'

type MapRasterTuning = {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  opacity: number
}

type ServiceSensorState = Record<ServiceSensorId, { running: boolean; index: number }>

type RequireAuthProps = {
  user: User | null
  authReady: boolean
}

const SERVICE_CATEGORY_LABEL: Record<ServiceAssetCategory, string> = {
  DIVISION: '사단 위치',
  UPPER_COMMAND: '상급지휘소 위치',
  ARTILLERY: '포병부대 위치',
  ARMOR: '전차부대 위치',
  SAR: 'SAR',
  UAV: 'UAV(EO/IR)',
  DRONE: '드론',
  GROUND_RADAR: '지상감시 레이더',
}

const SERVICE_CATEGORY_COLOR: Record<ServiceAssetCategory, string> = {
  DIVISION: '#2dd4bf',
  UPPER_COMMAND: '#ec4899',
  ARTILLERY: '#f97316',
  ARMOR: '#60a5fa',
  SAR: '#22c55e',
  UAV: '#38bdf8',
  DRONE: '#c026d3',
  GROUND_RADAR: '#f59e0b',
}

const SENSOR_BUTTON_META: Record<
  ServiceSensorId,
  { label: string; category?: ServiceAssetCategory; color: string }
> = {
  sar: { label: 'SAR', category: 'SAR', color: '#22c55e' },
  uav: { label: 'UAV (EO/IR)', category: 'UAV', color: '#38bdf8' },
  drone: { label: '드론 근접', category: 'DRONE', color: '#c026d3' },
  fmcw: { label: '지상감시 레이더(FMCW)', color: '#f97316' },
}

const INITIAL_SENSOR_STATE: ServiceSensorState = {
  sar: { running: false, index: 0 },
  uav: { running: false, index: 0 },
  drone: { running: false, index: 0 },
  fmcw: { running: false, index: 0 },
}

const LAYER_TOGGLE_LABEL: Record<LayerToggleKey, string> = {
  friendly: '아군(DB 자산)',
  enemy: '적',
  enemySymbol: '적 식별번호(지표)',
  ally: '우군',
  neutral: '중립',
}

/** 지도 레이어 초기값·시나리오 리셋 시 동일 적용 — 첫 접속에도 적·우군·중립·아군 모두 표시 */
const DEFAULT_LAYER_VISIBLE: Record<LayerToggleKey, boolean> = {
  friendly: true,
  enemy: true,
  enemySymbol: true,
  ally: true,
  neutral: true,
}

const GOOGLE_BASE_PRESETS: Record<GoogleBasePresetId, { label: string; sourceId: string; layerId: string }> = {
  hybrid: { label: '하이브리드(위성+라벨)', sourceId: 'google', layerId: 'google-satellite' },
  satellite: { label: '위성(라벨 없음)', sourceId: 'google-satellite-clean', layerId: 'google-satellite-clean' },
  roadmap: { label: '일반 도로', sourceId: 'google-roadmap', layerId: 'google-roadmap' },
  terrain: { label: '지형', sourceId: 'google-terrain', layerId: 'google-terrain' },
}

const GOOGLE_BASE_LAYER_IDS = Object.values(GOOGLE_BASE_PRESETS).map((preset) => preset.layerId)

const GOOGLE_BASE_SOURCE_TILES: Record<GoogleBasePresetId, string> = {
  hybrid: 'https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
  satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  roadmap: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  terrain: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
}

const DEFAULT_MAP_RASTER_TUNING: MapRasterTuning = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  opacity: 100,
}

const DUMMY_SCENARIO_ENTITIES: ReadonlyArray<ScenarioEntity> = [
  {
    id: 9001,
    name: '평양 권역 집결',
    lat: 39.0392,
    lng: 125.7625,
    relation: 'ENEMY',
    kind: 'MBT',
    status: '집결 후 남하 준비',
    speedKph: 420,
    headingDeg: 188,
    riskLevel: '중간',
    enemyCategory: 'armored_battalion',
    detectionStatus: 'detected',
    confidence: 'suspected',
    trackId: '49001',
  },
  {
    id: 9002,
    name: '함흥 축선 집결',
    lat: 39.8417,
    lng: 127.535,
    relation: 'ENEMY',
    kind: 'MBT',
    status: '동부 축선 기동 준비',
    speedKph: 420,
    headingDeg: 214,
    riskLevel: '높음',
    enemyCategory: 'armored_battalion',
    detectionStatus: 'identified',
    confidence: 'suspected',
    trackId: '49002',
  },
  {
    id: 9003,
    name: '남하 축선 기동',
    lat: 39.723,
    lng: 127.485,
    relation: 'ENEMY',
    kind: 'MBT',
    status: '남하 진행',
    speedKph: 420,
    headingDeg: 203,
    riskLevel: '중간',
    enemyCategory: 'mechanized_battalion',
    detectionStatus: 'tracking',
    confidence: 'suspected',
    trackId: '49003',
  },
  {
    id: 9050,
    name: 'GRD 변화·접촉선 후보',
    // 시작 시점 즉시 GRD 검출영역 내부에 걸리지 않도록 북쪽으로 이격
    lat: 39.86,
    lng: 126.18,
    relation: 'ENEMY',
    kind: 'MBT',
    status: 'GRD 후보·집결 추정',
    speedKph: 420,
    headingDeg: 185,
    riskLevel: '높음',
    enemyCategory: 'grd_motion_cluster',
    detectionStatus: 'detected',
    confidence: 'suspected',
    trackId: '49050',
    grdTankEstimate: 40,
    grdRiskScore: 100,
  },
  {
    id: 9101,
    name: '우방군 전방 관측소 1',
    lat: 37.622,
    lng: 126.903,
    relation: 'ALLY',
    kind: 'OBS',
    status: '연동 감시',
    speedKph: 0,
    headingDeg: 0,
    riskLevel: '낮음',
  },
  {
    id: 9102,
    name: '우방군 전방 관측소 2',
    lat: 37.598,
    lng: 127.082,
    relation: 'ALLY',
    kind: 'OBS',
    status: '연동 감시',
    speedKph: 0,
    headingDeg: 0,
    riskLevel: '낮음',
  },
  {
    id: 9201,
    name: '중립 민간 차량 행렬',
    lat: 37.637,
    lng: 126.968,
    relation: 'NEUTRAL',
    kind: 'CIV',
    status: '일반 이동',
    speedKph: 42,
    headingDeg: 120,
    riskLevel: '낮음',
  },
]

/** 요청 반영: 아래 두 적 MBT는 고정 표적으로 유지(좌표 갱신 제외) */
const IMMOBILE_ENEMY_ENTITY_IDS = new Set<number>([9002, 9050])

/** 실시간 전장 서비스 — 최초 진입 시 광역 시점(동·중앙아시아 중심, 줌 ~2.5) MapLibre [lng, lat] */
const BATTLEFIELD_SERVICE_MAP_INITIAL_CENTER: [number, number] = [80, 30]
const BATTLEFIELD_SERVICE_MAP_INITIAL_ZOOM = 2.5

/** 적 MBT 핀은 남하 시뮬 좌표(`enemyBattlefieldPoses`)가 생긴 뒤에만 지도에 표시 — 집결지 정적 마커 제거 */
function scenarioMbtEnemyVisibleOnMap(
  entity: ScenarioEntity,
  poses: Record<number, { lat: number; lng: number }>,
): boolean {
  if (entity.relation === 'ENEMY' && entity.kind === 'MBT') {
    return poses[entity.id] != null
  }
  return true
}

/** UAV가 이 거리(km) 안에 들어오면 적 MBT를 추적 모드로 전환 */
const BATTLEFIELD_UAV_ENEMY_ACQUIRE_KM = 52
/** UAV 시뮬 1틱(센서 궤적 타이머와 동일) 이동 거리(km) */
const BATTLEFIELD_UAV_SIM_STEP_KM = 0.22
/** 사용자가 UAV 출동 후보를 명시 선택한 경우, 지도에서 움직임이 체감되도록 가속 */
const BATTLEFIELD_UAV_DISPATCH_STEP_KM = 1.35
const BATTLEFIELD_UAV_CLICK_VIDEO_URL = '/media/demo-drone-map.mp4'
const TACTIC_VIDEO_FALLBACK_URLS = ['/media/yolo-tank-1.mp4', '/media/yolo-tank-2.mp4', '/media/yolo-tank-3.mp4'] as const
const TACTIC_VIDEO_URL_BY_NAME: Record<string, string> = {
  '즉응 화력 차단': '/media/yolo-tank-1.mp4',
  '우회 차단 기동': '/media/yolo-tank-2.mp4',
  '감시 지속·교란': '/media/yolo-tank-3.mp4',
  '감시 지속·추적': '/media/yolo-tank-1.mp4',
  '선제 화력 경고사격': '/media/yolo-tank-2.mp4',
  '감시 유지': '/media/yolo-tank-1.mp4',
  '예비대 대기': '/media/yolo-tank-3.mp4',
}

function tacticVideoUrlForName(name: string): string {
  const mapped = TACTIC_VIDEO_URL_BY_NAME[name]
  if (mapped) return mapped
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return TACTIC_VIDEO_FALLBACK_URLS[hash % TACTIC_VIDEO_FALLBACK_URLS.length]!
}

/** 드론도 UAV와 동일한 목표/추적 알고리즘으로 이동 */
const BATTLEFIELD_DRONE_ENEMY_ACQUIRE_KM = 52
const BATTLEFIELD_DRONE_SIM_STEP_KM = 1.35
const UAV_ASSET_STREAM_FALLBACK_VIDEO_URLS = [
  '/media/yolo-tank-1.mp4',
  '/media/yolo-tank-2.mp4',
  '/media/yolo-tank-3.mp4',
] as const
const DRONE_ASSET_STREAM_FALLBACK_VIDEO_URLS = ['/media/demo-drone-map.mp4'] as const
/** 적 도로기동 속도 배율(발표/데모용 고속 가속) */
const BATTLEFIELD_ENEMY_MARCH_TIME_SCALE = 3.0
const BATTLEFIELD_SPEED_OPTIONS = [1, 2, 4] as const

type GroundRadarSite = {
  id: number
  name: string
  axisLabel: string
  lat: number
  lng: number
  headingDeg: number
  fovDeg: number
  rangeKm: number
  reliabilityBase: number
}

const GROUND_RADAR_SITES: readonly GroundRadarSite[] = [
  {
    id: 97001,
    name: '지상감시레이더-01',
    axisLabel: '파주 전방 감시축',
    lat: 37.927,
    lng: 126.792,
    // 북부 서측 축선(개성~평양 방면)까지 넓게 커버
    headingDeg: 344,
    fovDeg: 128,
    rangeKm: 80,
    reliabilityBase: 0.78,
  },
  {
    id: 97002,
    name: '지상감시레이더-02',
    axisLabel: '화천 전방 감시축',
    lat: 38.117,
    lng: 127.707,
    // 중부 정면 축선(철원~원산 방면) 중심 커버
    headingDeg: 336,
    fovDeg: 126,
    rangeKm: 80,
    reliabilityBase: 0.81,
  },
  {
    id: 97003,
    name: '지상감시레이더-03',
    axisLabel: '강화 양도면 감시축',
    // 인천 강화군 양도면 행정중심(개방지도 Nominatim administrative centroid)
    lat: 37.66768,
    lng: 126.42845,
    // 서해안·강화 서부에서 북서~북 방향 위협축(개성·개경 방면)을 주 시야로
    headingDeg: 335,
    fovDeg: 128,
    rangeKm: 80,
    reliabilityBase: 0.8,
  },
]

function normalizeBearingDeltaDeg(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

function signedBearingDeltaDeg(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180
}

function projectPointToRadarLocalKm(
  origin: { lat: number; lng: number; headingDeg: number },
  point: { lat: number; lng: number },
): { xKm: number; yKm: number } {
  const distKm = haversineKm(origin, point)
  const absoluteBearing = bearingDeg(origin.lat, origin.lng, point.lat, point.lng)
  const relativeDeg = signedBearingDeltaDeg(origin.headingDeg, absoluteBearing)
  const rad = (relativeDeg * Math.PI) / 180
  return {
    xKm: distKm * Math.cos(rad),
    yKm: distKm * Math.sin(rad),
  }
}

function isPointInsideGroundRadarSector(
  site: GroundRadarSite,
  point: { lat: number; lng: number },
): boolean {
  const distanceKm = haversineKm(site, point)
  if (distanceKm > site.rangeKm) return false
  const bearing = bearingDeg(site.lat, site.lng, point.lat, point.lng)
  return normalizeBearingDeltaDeg(bearing, site.headingDeg) <= site.fovDeg / 2
}

function buildGroundRadarCoverageGeojson(sites: readonly GroundRadarSite[]) {
  return {
    type: 'FeatureCollection' as const,
    features: sites.map((site) => ({
      type: 'Feature' as const,
      id: String(site.id),
      properties: {
        coverageKind: 'boundary',
        radarId: site.id,
        name: site.name,
        axisLabel: site.axisLabel,
        headingDeg: site.headingDeg,
        fovDeg: site.fovDeg,
        rangeKm: site.rangeKm,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          buildRadarSectorPath(
            site.lat,
            site.lng,
            site.rangeKm * 1000,
            site.headingDeg,
            site.fovDeg,
          ).map((pt) => [pt.lng, pt.lat] as [number, number]),
        ],
      },
    })),
  }
}

function buildGroundRadarServiceAssets(): ServiceAssetPoint[] {
  const videoById: Record<number, string> = {
    97001: '/media/yolo-tank-2.mp4',
    97002: '/media/yolo-tank-3.mp4',
    97003: '/media/yolo-tank-1.mp4',
  }
  return GROUND_RADAR_SITES.map((site) => ({
    id: site.id,
    name: site.name,
    lat: site.lat,
    lng: site.lng,
    unitCode: buildUnitIdentificationCode('GROUND_RADAR', site.id),
    category: 'GROUND_RADAR',
    level: '중대',
    formation: site.axisLabel,
    elevationM: 122,
    mgrs: latLngToMgrsSafe(site.lat, site.lng),
    readiness: '최고',
    mission: '전방 감시축 상시 감시',
    situationVideoUrl: videoById[site.id] ?? '/media/yolo-tank-1.mp4',
  }))
}

const SOUTH_KOREA_DIVISION_LAYOUT: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: 37.2636, lng: 127.0286 }, // 수원
  { lat: 36.3504, lng: 127.3845 }, // 대전
  { lat: 35.8242, lng: 127.148 }, // 전주
  { lat: 35.8714, lng: 128.6014 }, // 대구
  { lat: 35.1796, lng: 129.0756 }, // 부산
]

const SOUTH_KOREA_UPPER_COMMAND_LAYOUT: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: 37.4563, lng: 126.7052 }, // 인천
  { lat: 37.7519, lng: 128.8761 }, // 강릉
  { lat: 36.991, lng: 127.9259 }, // 충주
  { lat: 35.1595, lng: 126.8526 }, // 광주
  { lat: 33.4996, lng: 126.5312 }, // 제주
]

const MIN_COMMAND_ASSET_COUNT = 5

function redistributeCommandAssetsAcrossSouthKorea(
  units: ServiceAssetPoint[],
): ServiceAssetPoint[] {
  let divisionIdx = 0
  let upperIdx = 0
  return units.map((unit) => {
    if (unit.category === 'DIVISION') {
      const pos = SOUTH_KOREA_DIVISION_LAYOUT[divisionIdx % SOUTH_KOREA_DIVISION_LAYOUT.length]
      divisionIdx += 1
      return {
        ...unit,
        lat: pos!.lat,
        lng: pos!.lng,
        mgrs: latLngToMgrsSafe(pos!.lat, pos!.lng),
      }
    }
    if (unit.category === 'UPPER_COMMAND') {
      const pos = SOUTH_KOREA_UPPER_COMMAND_LAYOUT[upperIdx % SOUTH_KOREA_UPPER_COMMAND_LAYOUT.length]
      upperIdx += 1
      return {
        ...unit,
        lat: pos!.lat,
        lng: pos!.lng,
        mgrs: latLngToMgrsSafe(pos!.lat, pos!.lng),
      }
    }
    return unit
  })
}

function ensureCommandAssetsPresence(units: ServiceAssetPoint[]): ServiceAssetPoint[] {
  const next = [...units]
  let nextId = next.reduce((max, row) => Math.max(max, row.id), 96000) + 1

  const appendMissing = (
    category: ServiceAssetCategory,
    layout: ReadonlyArray<{ lat: number; lng: number }>,
    namePrefix: string,
    formation: string,
    mission: string,
  ) => {
    const existingCount = next.filter((row) => row.category === category).length
    const targetCount = Math.min(layout.length, MIN_COMMAND_ASSET_COUNT)
    for (let i = existingCount; i < targetCount; i += 1) {
      const pos = layout[i]!
      const id = nextId
      nextId += 1
      next.push({
        id,
        name: `${namePrefix}-${i + 1}`,
        lat: pos.lat,
        lng: pos.lng,
        unitCode: buildUnitIdentificationCode(category, id),
        category,
        level: '대대',
        formation,
        elevationM: 72,
        mgrs: latLngToMgrsSafe(pos.lat, pos.lng),
        readiness: '양호',
        mission,
        situationVideoUrl: null,
      })
    }
  }

  appendMissing(
    'DIVISION',
    SOUTH_KOREA_DIVISION_LAYOUT,
    '사단 위치',
    '사단 지휘',
    '권역 작전 통제',
  )
  appendMissing(
    'UPPER_COMMAND',
    SOUTH_KOREA_UPPER_COMMAND_LAYOUT,
    '상급지휘소 위치',
    '상급 지휘',
    '전구 지휘 통합',
  )
  return next
}

const UNIT_CODE_CATEGORY_DIGIT: Record<ServiceAssetCategory, string> = {
  DIVISION: '1',
  UPPER_COMMAND: '2',
  ARTILLERY: '3',
  ARMOR: '4',
  SAR: '5',
  UAV: '6',
  DRONE: '7',
  GROUND_RADAR: '8',
}

function buildUnitIdentificationCode(category: ServiceAssetCategory, id: number): string {
  const digit = UNIT_CODE_CATEGORY_DIGIT[category] ?? '0'
  const seq = String(Math.abs(id) % 10000).padStart(4, '0')
  return `A${digit}${seq}`
}

/** API 등에서 빈 문자열이 오면 `??`로는 보완되지 않으므로 trim 후 비었을 때만 규칙 코드 생성 */
function effectiveUnitIdentificationCode(
  category: ServiceAssetCategory,
  id: number,
  raw?: string | null,
): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t.length > 0) return t
  return buildUnitIdentificationCode(category, id)
}

function normalizeServiceAssetPoints(assets: ServiceAssetPoint[]): ServiceAssetPoint[] {
  return assets.map((a) => {
    const unitCode = effectiveUnitIdentificationCode(a.category, a.id, a.unitCode)
    return unitCode === a.unitCode ? a : { ...a, unitCode }
  })
}

function resolveUnitCodeForGeoJsonPoint(point: {
  id: number
  category: string
  unitCode?: string | null
}): string {
  const trimmed = typeof point.unitCode === 'string' ? point.unitCode.trim() : ''
  if (trimmed.length > 0) return trimmed
  if (Object.prototype.hasOwnProperty.call(UNIT_CODE_CATEGORY_DIGIT, point.category)) {
    return buildUnitIdentificationCode(point.category as ServiceAssetCategory, point.id)
  }
  return ''
}

/** 시나리오 지도·라벨용 식별번호(적 E4… / 우군 W2… / 중립 N0…) */
function buildScenarioEntityUnitCode(entity: ScenarioEntity): string {
  const existing = entity.unitCode?.trim()
  if (existing) return existing
  const seq = String(Math.abs(entity.id) % 10000).padStart(4, '0')
  if (entity.relation === 'ENEMY') return `E4${seq}`
  if (entity.relation === 'ALLY') return `W2${seq}`
  return `N0${seq}`
}

function scenarioEntityToGeoJsonProperties(entity: ScenarioEntity): {
  id: number
  name: string
  lat: number
  lng: number
  category: string
  relation: string
  kind: string
  status: string
  speedKph: number
  headingDeg: number
  riskLevel: string
  unitCode: string
  scenario_label_multi: string
  scenario_label_compact: string
  grdTankEstimate?: number
  grdRiskScore?: number
} {
  const unitCode = buildScenarioEntityUnitCode(entity)
  const labels = buildScenarioMapLabels(entity, unitCode)
  return {
    id: entity.id,
    name: labels.legendName,
    scenario_label_multi: labels.scenario_label_multi,
    scenario_label_compact: labels.scenario_label_compact,
    lat: entity.lat,
    lng: entity.lng,
    category: 'SCENARIO',
    relation: entity.relation,
    kind: entity.kind,
    status: entity.status,
    speedKph: entity.speedKph,
    headingDeg: entity.headingDeg,
    riskLevel: entity.riskLevel,
    unitCode,
    ...(entity.grdTankEstimate != null ? { grdTankEstimate: entity.grdTankEstimate } : {}),
    ...(entity.grdRiskScore != null ? { grdRiskScore: entity.grdRiskScore } : {}),
  }
}

type GroundRadarDetectedEnemy = {
  enemyId: number
  name: string
  lat: number
  lng: number
  headingDeg: number
  speedKph: number
}

type FutureRiskCandidate = {
  frameWindow: 3 | 5
  enemyId: number
  enemyName: string
  clusterId: number
  lat: number
  lng: number
  probability: number
  etaMin: number
  speedKph: number
}

type SimulationTimelineSnapshot = {
  enemyBattlefieldPoses: Record<number, { lat: number; lng: number }>
  enemyMarchAlongM: Record<number, number>
  uavSimPos: { lat: number; lng: number } | null
  droneSimPos: { lat: number; lng: number } | null
  sensorState: ServiceSensorState
}

function cloneEnemyPoseMap(
  poses: Record<number, { lat: number; lng: number }>,
): Record<number, { lat: number; lng: number }> {
  const out: Record<number, { lat: number; lng: number }> = {}
  for (const [rawId, point] of Object.entries(poses)) {
    out[Number(rawId)] = { lat: point.lat, lng: point.lng }
  }
  return out
}

function cloneSensorState(state: ServiceSensorState): ServiceSensorState {
  return {
    sar: { ...state.sar },
    uav: { ...state.uav },
    drone: { ...state.drone },
    fmcw: { ...state.fmcw },
  }
}

type GroundRadarVodFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, string | number | boolean | null>
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] }
      | { type: 'Polygon'; coordinates: [number, number][][] }
  }>
}

function runDbscanByHaversine(
  points: GroundRadarDetectedEnemy[],
  epsKm: number,
  minPoints: number,
): number[] {
  const UNVISITED = -99
  const NOISE = -1
  const labels = Array(points.length).fill(UNVISITED) as number[]
  let clusterId = 0
  const neighborsOf = (index: number): number[] => {
    const out: number[] = []
    for (let j = 0; j < points.length; j += 1) {
      if (haversineKm(points[index]!, points[j]!) <= epsKm) out.push(j)
    }
    return out
  }
  for (let i = 0; i < points.length; i += 1) {
    if (labels[i] !== UNVISITED) continue
    const seed = neighborsOf(i)
    if (seed.length < minPoints) {
      labels[i] = NOISE
      continue
    }
    labels[i] = clusterId
    const queue = [...seed]
    while (queue.length > 0) {
      const q = queue.shift()!
      if (labels[q] === NOISE) labels[q] = clusterId
      if (labels[q] !== UNVISITED) continue
      labels[q] = clusterId
      const qn = neighborsOf(q)
      if (qn.length >= minPoints) {
        for (const ni of qn) {
          if (!queue.includes(ni)) queue.push(ni)
        }
      }
    }
    clusterId += 1
  }
  return labels
}

function buildFrameWindowPrediction(
  history: MarchPoint[],
  frameWindow: 3 | 5,
): { past: MarchPoint[]; future: MarchPoint[]; headingDeg: number; lengthKm: number } | null {
  if (history.length < frameWindow) return null
  const past = history.slice(-frameWindow)
  if (past.length < 2) return null

  let sumDLat = 0
  let sumDLng = 0
  for (let i = 1; i < past.length; i += 1) {
    sumDLat += past[i]!.lat - past[i - 1]!.lat
    sumDLng += past[i]!.lng - past[i - 1]!.lng
  }
  const stepDiv = Math.max(1, past.length - 1)
  const stepLat = sumDLat / stepDiv
  const stepLng = sumDLng / stepDiv
  const last = past[past.length - 1]!
  const future: MarchPoint[] = []
  for (let i = 1; i <= frameWindow; i += 1) {
    future.push({
      lat: last.lat + stepLat * i,
      lng: last.lng + stepLng * i,
    })
  }
  if (future.length === 0) return null

  const headingDeg = bearingDeg(last.lat, last.lng, future[future.length - 1]!.lat, future[future.length - 1]!.lng)
  const lengthKm = future.reduce((sum, point, idx) => {
    const from = idx === 0 ? last : future[idx - 1]!
    return sum + haversineKm(from, point)
  }, 0)

  return {
    past,
    future,
    headingDeg,
    lengthKm,
  }
}

function buildVectorAxisPath(
  start: MarchPoint,
  headingDeg: number,
  rangeKm: number,
  midTurnDeg = 0,
  endTurnDeg = 0,
): MarchPoint[] {
  const mid = offsetLatLng(
    start.lat,
    start.lng,
    headingDeg + midTurnDeg,
    Math.max(0.2, rangeKm * 0.56),
  )
  const end = offsetLatLng(start.lat, start.lng, headingDeg + endTurnDeg, rangeKm)
  return [
    { lat: start.lat, lng: start.lng },
    { lat: mid.lat, lng: mid.lng },
    { lat: end.lat, lng: end.lng },
  ]
}

function buildVectorConeRing(
  start: MarchPoint,
  headingDeg: number,
  rangeKm: number,
  halfAngleDeg: number,
  steps = 20,
): [number, number][] {
  const ring: [number, number][] = [[start.lng, start.lat]]
  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps
    const angle = headingDeg - halfAngleDeg + ratio * (halfAngleDeg * 2)
    const p = offsetLatLng(start.lat, start.lng, angle, rangeKm)
    ring.push([p.lng, p.lat])
  }
  ring.push([start.lng, start.lat])
  return ring
}

function pathOverlapsRiskZones(
  path: MarchPoint[],
  ownClusterId: number,
  riskZones: Array<{ clusterId: number; centerLat: number; centerLng: number; radiusKm: number }>,
): boolean {
  for (const point of path) {
    for (const zone of riskZones) {
      if (zone.clusterId === ownClusterId) continue
      if (haversineKm(point, { lat: zone.centerLat, lng: zone.centerLng }) <= zone.radiusKm) {
        return true
      }
    }
  }
  return false
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function polylineLengthKm(points: MarchPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1]!, points[i]!)
  }
  return total
}

function buildProbabilisticFutureRiskZones(
  candidates: FutureRiskCandidate[],
  frameWindow: 3 | 5,
): Array<{
  centerLat: number
  centerLng: number
  probabilityPct: number
  etaMin: number
  radiusKm: number
  targetCount: number
  riskScore: number
}> {
  const horizonMaxMin = frameWindow === 3 ? 12 : 20
  const mergeDistanceKm = frameWindow === 3 ? 8.5 : 11
  const filtered = candidates.filter(
    (row) =>
      Number.isFinite(row.etaMin) &&
      row.etaMin >= 0 &&
      row.etaMin <= horizonMaxMin &&
      Number.isFinite(row.probability) &&
      row.probability > 0,
  )
  if (filtered.length === 0) return []

  const groups: FutureRiskCandidate[][] = []
  const weightedCenter = (items: FutureRiskCandidate[]): { lat: number; lng: number } => {
    const weightSum = items.reduce((sum, item) => sum + item.probability, 0)
    if (weightSum <= 1e-6) {
      const fallback = items[0]!
      return { lat: fallback.lat, lng: fallback.lng }
    }
    const lat = items.reduce((sum, item) => sum + item.lat * item.probability, 0) / weightSum
    const lng = items.reduce((sum, item) => sum + item.lng * item.probability, 0) / weightSum
    return { lat, lng }
  }

  const sorted = [...filtered].sort((a, b) => b.probability - a.probability)
  for (const candidate of sorted) {
    let matchedIndex = -1
    let matchedDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < groups.length; i += 1) {
      const center = weightedCenter(groups[i]!)
      const distanceKm = haversineKm(
        { lat: candidate.lat, lng: candidate.lng },
        { lat: center.lat, lng: center.lng },
      )
      if (distanceKm <= mergeDistanceKm && distanceKm < matchedDistance) {
        matchedDistance = distanceKm
        matchedIndex = i
      }
    }
    if (matchedIndex >= 0) {
      groups[matchedIndex]!.push(candidate)
    } else {
      groups.push([candidate])
    }
  }

  return groups
    .map((items) => {
      const center = weightedCenter(items)
      const weightSum = items.reduce((sum, item) => sum + item.probability, 0)
      const unionProbability = 1 - items.reduce((prod, item) => prod * (1 - clampNumber(item.probability, 0.01, 0.97)), 1)
      const probabilityPct = Math.round(clampNumber(unionProbability * 100, 5, 99))
      const etaMin =
        weightSum > 1e-6
          ? items.reduce((sum, item) => sum + item.etaMin * item.probability, 0) / weightSum
          : items.reduce((sum, item) => sum + item.etaMin, 0) / items.length
      const avgSpeedKph = items.reduce((sum, item) => sum + item.speedKph, 0) / items.length
      const enemyCount = new Set(items.map((item) => item.enemyId)).size
      const radiusKm = clampNumber(
        3.6 + etaMin * (frameWindow === 3 ? 0.38 : 0.52) + enemyCount * 1.25 + avgSpeedKph / 78,
        frameWindow === 3 ? 5 : 7,
        frameWindow === 3 ? 16 : 22,
      )
      const riskScore = Math.round(
        clampNumber(probabilityPct * 0.72 + enemyCount * 10 + avgSpeedKph * 0.22, 35, 99),
      )
      return {
        centerLat: center.lat,
        centerLng: center.lng,
        probabilityPct,
        etaMin,
        radiusKm,
        targetCount: enemyCount,
        riskScore,
      }
    })
    .sort((a, b) => b.riskScore - a.riskScore)
}

function buildCircleRing(lat: number, lng: number, radiusKm: number, steps = 28): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i += 1) {
    const deg = (360 * i) / steps
    const p = offsetLatLng(lat, lng, deg, radiusKm)
    ring.push([p.lng, p.lat])
  }
  return ring
}

function uavSimHeadingForPopup(
  lat: number,
  lng: number,
  chasingEnemyId: number | null,
  mission: { centerLat: number; centerLng: number } | null,
  enemyPoses: Record<number, { lat: number; lng: number }>,
): number | undefined {
  if (chasingEnemyId != null) {
    const e = DUMMY_SCENARIO_ENTITIES.find((x) => x.id === chasingEnemyId)
    if (e) {
      const p = enemyPoses[e.id] ?? { lat: e.lat, lng: e.lng }
      return bearingDeg(lat, lng, p.lat, p.lng)
    }
  }
  if (mission) {
    return bearingDeg(lat, lng, mission.centerLat, mission.centerLng)
  }
  return undefined
}

type BattlefieldMbtEnemyLike = { lat: number; lng: number; relation: string; kind: string }

function snapshotDroneMvpForBattlefieldService(
  input: {
    lat: number
    lng: number
    mgrs: string
    pathLength: number
    pathIndex: number
    running: boolean
    phaseAtLeastDrone: boolean
  },
  opts?: {
    strikeTarget?: { lat: number; lng: number } | null
    forceEoIrFeed?: boolean
  },
  enemyEntities: ReadonlyArray<BattlefieldMbtEnemyLike> = DUMMY_SCENARIO_ENTITIES,
): DroneMvpSnapshot {
  let distKm = nearestMbtEnemyDistanceKm({ lat: input.lat, lng: input.lng }, enemyEntities)
  const strike = opts?.strikeTarget
  if (strike) {
    const dStrike = haversineKm({ lat: input.lat, lng: input.lng }, strike)
    distKm = distKm == null ? dStrike : Math.min(distKm, dStrike)
  }
  return buildDroneMvpSnapshot({
    lat: input.lat,
    lng: input.lng,
    mgrs: input.mgrs,
    pathLength: input.pathLength,
    pathIndex: input.pathIndex,
    running: input.running,
    phaseAtLeastDrone: input.phaseAtLeastDrone,
    distanceToNearestEnemyKm: distKm,
    identificationRangeKm: DRONE_ENEMY_IDENTIFICATION_RANGE_KM,
    forceEoIrFeed: opts?.forceEoIrFeed === true,
  })
}

const SERVICE_ASSETS_SOURCE_ID = 'service-assets-source'
const SERVICE_ASSETS_CLUSTER_LAYER_ID = 'service-assets-cluster-layer'
const SERVICE_ASSETS_CLUSTER_COUNT_LAYER_ID = 'service-assets-cluster-count-layer'
const SERVICE_ASSETS_LAYER_ID = 'service-assets-layer'
const SERVICE_ASSETS_LABEL_LAYER_ID = 'service-assets-label-layer'
const SERVICE_ASSETS_SYMBOL_SOURCE_ID = 'service-assets-symbol-source'
const SERVICE_ASSETS_SYMBOL_LAYER_ID = 'service-assets-symbol-layer'
const SERVICE_ASSETS_CLUSTER_MAX_ZOOM = 10
const SERVICE_ASSETS_CLUSTER_RADIUS = 56
const SERVICE_MOVERS_SOURCE_ID = 'service-movers-source'
const SERVICE_MOVERS_LAYER_ID = 'service-movers-layer'
const SERVICE_MOVERS_LABEL_LAYER_ID = 'service-movers-label-layer'
const SERVICE_SCENARIO_SOURCE_ID = 'service-scenario-source'
const SERVICE_ENEMY_LAYER_ID = 'service-enemy-layer'
/** 적 기갑(MB) 표준부호 프레임 — MapLibre `symbol` 아이콘 */
const SERVICE_SCENARIO_ENEMY_SYMBOL_IMAGE_ID = 'service-scenario-enemy-armor-symbol'
const SERVICE_SCENARIO_ENEMY_SYMBOL_LAYER_ID = 'service-scenario-enemy-symbol-layer'
const SERVICE_ALLY_LAYER_ID = 'service-ally-layer'
const SERVICE_NEUTRAL_LAYER_ID = 'service-neutral-layer'
const SERVICE_SCENARIO_LABEL_LAYER_ID = 'service-scenario-label-layer'
const SERVICE_SAR2_ZONE_SOURCE_ID = 'service-sar2-zone-source'
const SERVICE_SAR2_ZONE_FILL_LAYER_ID = 'service-sar2-zone-fill-layer'
const SERVICE_SAR2_ZONE_LINE_LAYER_ID = 'service-sar2-zone-line-layer'
const SERVICE_ENEMY_ROUTE_SOURCE_ID = 'service-enemy-route-source'
const SERVICE_ENEMY_ROUTE_LAYER_ID = 'service-enemy-route-layer'
const SERVICE_ENEMY_ROUTE_ALERT_LAYER_ID = 'service-enemy-route-alert-layer'
const SERVICE_ENEMY_ROUTE_HIT_LAYER_ID = 'service-enemy-route-hit-layer'
const SERVICE_GROUND_RADAR_COVERAGE_SOURCE_ID = 'service-ground-radar-coverage-source'
const SERVICE_GROUND_RADAR_COVERAGE_FILL_LAYER_ID = 'service-ground-radar-coverage-fill-layer'
const SERVICE_GROUND_RADAR_COVERAGE_LINE_LAYER_ID = 'service-ground-radar-coverage-line-layer'
const SERVICE_GROUND_RADAR_COVERAGE_SCAN_LAYER_ID = 'service-ground-radar-coverage-scan-layer'
const SERVICE_GROUND_RADAR_VOD_SOURCE_ID = 'service-ground-radar-vod-source'
const SERVICE_GROUND_RADAR_DBSCAN_LAYER_ID = 'service-ground-radar-dbscan-layer'
const SERVICE_GROUND_RADAR_PAST_TRACK_LAYER_ID = 'service-ground-radar-past-track-layer'
const SERVICE_GROUND_RADAR_PAST_POINT_LAYER_ID = 'service-ground-radar-past-point-layer'
const SERVICE_GROUND_RADAR_PAST_TRACK_5_LAYER_ID = 'service-ground-radar-past-track-5-layer'
const SERVICE_GROUND_RADAR_PAST_POINT_5_LAYER_ID = 'service-ground-radar-past-point-5-layer'
const SERVICE_GROUND_RADAR_ALT_AXIS_LAYER_ID = 'service-ground-radar-alt-axis-layer'
const SERVICE_GROUND_RADAR_ALT_AXIS_5_LAYER_ID = 'service-ground-radar-alt-axis-5-layer'
const SERVICE_GROUND_RADAR_CORRIDOR_FILL_LAYER_ID = 'service-ground-radar-corridor-fill-layer'
const SERVICE_GROUND_RADAR_CORRIDOR_LINE_LAYER_ID = 'service-ground-radar-corridor-line-layer'
const SERVICE_GROUND_RADAR_CORRIDOR_5_FILL_LAYER_ID = 'service-ground-radar-corridor-5-fill-layer'
const SERVICE_GROUND_RADAR_CORRIDOR_5_LINE_LAYER_ID = 'service-ground-radar-corridor-5-line-layer'
const SERVICE_GROUND_RADAR_PREDICT_GLOW_LAYER_ID = 'service-ground-radar-predict-glow-layer'
const SERVICE_GROUND_RADAR_PREDICT_LAYER_ID = 'service-ground-radar-predict-layer'
const SERVICE_GROUND_RADAR_PREDICT_ENDPOINT_LAYER_ID = 'service-ground-radar-predict-endpoint-layer'
const SERVICE_GROUND_RADAR_PREDICT_SHORTEST_GLOW_LAYER_ID =
  'service-ground-radar-predict-shortest-glow-layer'
const SERVICE_GROUND_RADAR_PREDICT_SHORTEST_LAYER_ID = 'service-ground-radar-predict-shortest-layer'
const SERVICE_GROUND_RADAR_PREDICT_SHORTEST_ENDPOINT_LAYER_ID =
  'service-ground-radar-predict-shortest-endpoint-layer'
const SERVICE_GROUND_RADAR_RISK_FILL_LAYER_ID = 'service-ground-radar-risk-fill-layer'
const SERVICE_GROUND_RADAR_RISK_LINE_LAYER_ID = 'service-ground-radar-risk-line-layer'
const SERVICE_GROUND_RADAR_RISK_LABEL_LAYER_ID = 'service-ground-radar-risk-label-layer'
const SERVICE_GROUND_RADAR_RISK_SHORTEST_FILL_LAYER_ID = 'service-ground-radar-risk-shortest-fill-layer'
const SERVICE_GROUND_RADAR_RISK_SHORTEST_LINE_LAYER_ID = 'service-ground-radar-risk-shortest-line-layer'
const SERVICE_GROUND_RADAR_RISK_SHORTEST_LABEL_LAYER_ID =
  'service-ground-radar-risk-shortest-label-layer'
const SERVICE_FMCW_RISK_SOURCE_ID = 'service-fmcw-risk-source'
const SERVICE_FMCW_RISK_FILL_LAYER_ID = 'service-fmcw-risk-fill-layer'
const SERVICE_FMCW_RISK_LINE_LAYER_ID = 'service-fmcw-risk-line-layer'
const SERVICE_FMCW_INGRESS_LINE_LAYER_ID = 'service-fmcw-ingress-line-layer'
const SERVICE_FMCW_TRACK_LAYER_ID = 'service-fmcw-track-layer'
const SERVICE_GRD_MOTION_SOURCE_ID = 'service-grd-motion-source'
const SERVICE_GRD_MOTION_FILL_LAYER_ID = 'service-grd-motion-fill-layer'
const SERVICE_GRD_MOTION_LINE_LAYER_ID = 'service-grd-motion-line-layer'
const ENEMY_UAV_DISPATCH_REFERENCE_IMAGE_URL = '/media/enemy-uav-target-reference.png'

const SERVICE_ASSET_SYMBOL_IMAGE_ID: Record<ServiceAssetCategory, string> = {
  SAR: 'service-asset-symbol-sar',
  UAV: 'service-asset-symbol-uav',
  DRONE: 'service-asset-symbol-drone',
  GROUND_RADAR: 'service-asset-symbol-ground-radar',
  DIVISION: 'service-asset-symbol-division',
  UPPER_COMMAND: 'service-asset-symbol-upper-command',
  ARTILLERY: 'service-asset-symbol-artillery',
  ARMOR: 'service-asset-symbol-armor',
}

const SERVICE_ASSET_SYMBOL_SIZE = 56
const SERVICE_ASSET_SYMBOL_ICON_SIZE = 1.42
const SERVICE_FRIENDLY_SYMBOL_ICON_SIZE = SERVICE_ASSET_SYMBOL_ICON_SIZE
const SERVICE_FRIENDLY_SYMBOL_ICON_OFFSET: [number, number] = [0, -1.28]

function drawServiceSymbolFrame(ctx: CanvasRenderingContext2D, size: number, accentColor: string) {
  const frameX = 10
  const frameY = 12
  const frameW = size - 20
  const frameH = size - 24

  ctx.fillStyle = 'rgba(248,250,252,0.96)'
  ctx.fillRect(frameX, frameY, frameW, frameH)

  ctx.strokeStyle = 'rgba(2,6,23,0.94)'
  ctx.lineWidth = 2.6
  ctx.strokeRect(frameX, frameY, frameW, frameH)

  ctx.strokeStyle = 'rgba(15,23,42,0.78)'
  ctx.lineWidth = 1.5
  for (const x of [frameX + 9, frameX + frameW / 2, frameX + frameW - 9]) {
    ctx.beginPath()
    ctx.moveTo(x, frameY - 5)
    ctx.lineTo(x, frameY - 1)
    ctx.stroke()
  }

  ctx.strokeStyle = accentColor
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(frameX + 4, frameY + frameH - 3)
  ctx.lineTo(frameX + frameW - 4, frameY + frameH - 3)
  ctx.stroke()
}

function drawServiceSymbolGlyph(
  ctx: CanvasRenderingContext2D,
  category: ServiceAssetCategory,
  size: number,
) {
  const cx = size / 2
  const cy = size / 2 + 1
  const ink = 'rgba(15,23,42,0.97)'

  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 2.35
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (category) {
    case 'ARMOR': {
      ctx.beginPath()
      ctx.ellipse(cx, cy, 10, 5.8, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'ARTILLERY': {
      ctx.beginPath()
      ctx.arc(cx, cy, 3.3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'GROUND_RADAR': {
      ctx.beginPath()
      ctx.moveTo(cx - 11, cy + 6)
      ctx.lineTo(cx + 11, cy + 6)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy + 6, 9, Math.PI, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'UAV': {
      ctx.beginPath()
      ctx.moveTo(cx - 10, cy - 6)
      ctx.lineTo(cx, cy + 2)
      ctx.lineTo(cx + 10, cy - 6)
      ctx.stroke()
      break
    }
    case 'DRONE': {
      ctx.beginPath()
      ctx.moveTo(cx - 9, cy - 6)
      ctx.lineTo(cx, cy + 1)
      ctx.lineTo(cx + 9, cy - 6)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy + 4, 1.9, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'SAR': {
      ctx.beginPath()
      ctx.arc(cx - 2, cy + 2, 8, Math.PI * 1.16, Math.PI * 1.86)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx - 1, cy + 2, 4.8, Math.PI * 1.2, Math.PI * 1.82)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + 4, cy - 6)
      ctx.lineTo(cx + 9, cy - 10)
      ctx.stroke()
      break
    }
    case 'UPPER_COMMAND': {
      ctx.beginPath()
      ctx.moveTo(cx - 10, cy + 8)
      ctx.lineTo(cx - 10, cy - 9)
      ctx.lineTo(cx + 9, cy - 9)
      ctx.stroke()
      break
    }
    case 'DIVISION':
    default: {
      ctx.beginPath()
      ctx.moveTo(cx - 9, cy - 8)
      ctx.lineTo(cx + 9, cy + 8)
      ctx.moveTo(cx + 9, cy - 8)
      ctx.lineTo(cx - 9, cy + 8)
      ctx.stroke()
      break
    }
  }
  ctx.restore()
}

function buildServiceAssetSymbolImage(category: ServiceAssetCategory): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = SERVICE_ASSET_SYMBOL_SIZE
  canvas.height = SERVICE_ASSET_SYMBOL_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, SERVICE_ASSET_SYMBOL_SIZE, SERVICE_ASSET_SYMBOL_SIZE)
  drawServiceSymbolFrame(ctx, SERVICE_ASSET_SYMBOL_SIZE, SERVICE_CATEGORY_COLOR[category])
  drawServiceSymbolGlyph(ctx, category, SERVICE_ASSET_SYMBOL_SIZE)
  return ctx.getImageData(0, 0, SERVICE_ASSET_SYMBOL_SIZE, SERVICE_ASSET_SYMBOL_SIZE)
}

function ensureServiceAssetSymbolImages(map: maplibregl.Map) {
  for (const category of Object.keys(SERVICE_ASSET_SYMBOL_IMAGE_ID) as ServiceAssetCategory[]) {
    const imageId = SERVICE_ASSET_SYMBOL_IMAGE_ID[category]
    if (map.hasImage(imageId)) continue
    const imageData = buildServiceAssetSymbolImage(category)
    if (!imageData) continue
    map.addImage(imageId, imageData, { pixelRatio: 2 })
  }
}

/** 적 기갑 — 직사각형 프레임 + 타원(전장) 글리프, 아군 자산 심볼과 동일 규격 */
function buildScenarioEnemyArmoredSymbolImage(): ImageData | null {
  const size = SERVICE_ASSET_SYMBOL_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, size, size)
  const accent = '#f43f5e'
  const frameX = 10
  const frameY = 12
  const frameW = size - 20
  const frameH = size - 24

  ctx.fillStyle = 'rgba(255, 237, 237, 0.96)'
  ctx.fillRect(frameX, frameY, frameW, frameH)

  ctx.strokeStyle = 'rgba(127, 29, 29, 0.95)'
  ctx.lineWidth = 2.6
  ctx.strokeRect(frameX, frameY, frameW, frameH)

  ctx.strokeStyle = 'rgba(153, 27, 27, 0.78)'
  ctx.lineWidth = 1.5
  for (const x of [frameX + 9, frameX + frameW / 2, frameX + frameW - 9]) {
    ctx.beginPath()
    ctx.moveTo(x, frameY - 5)
    ctx.lineTo(x, frameY - 1)
    ctx.stroke()
  }

  ctx.strokeStyle = accent
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(frameX + 4, frameY + frameH - 3)
  ctx.lineTo(frameX + frameW - 4, frameY + frameH - 3)
  ctx.stroke()

  const cx = size / 2
  const cy = size / 2 + 1
  const ink = 'rgba(88, 28, 28, 0.96)'
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 2.35
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.ellipse(cx, cy, 10, 5.8, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = 'rgba(185, 28, 28, 0.95)'
  ctx.font = '600 11px system-ui, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('적', frameX + frameW / 2, frameY - 6)

  return ctx.getImageData(0, 0, size, size)
}

function ensureScenarioEnemySymbolImage(map: maplibregl.Map) {
  if (map.hasImage(SERVICE_SCENARIO_ENEMY_SYMBOL_IMAGE_ID)) return
  const imageData = buildScenarioEnemyArmoredSymbolImage()
  if (!imageData) return
  map.addImage(SERVICE_SCENARIO_ENEMY_SYMBOL_IMAGE_ID, imageData, { pixelRatio: 2 })
}

/** SAR·GRD 시각화 팝업용 샘플(위성/SAR 톤) — `public/media/sar-grd-visualization.png` */
const SAR_GRD_VISUALIZATION_IMAGE_URL = '/media/sar-grd-visualization.png'

/** SAR Spotlight(관측 구역 클릭 시 표시되는 인식 결과 샘플 이미지) */

/** 지도 빈 곳 클릭 시 팝업을 닫지 않도록 제외할 레이어(객체·라벨·클러스터·SAR 구역 등) */
const SERVICE_MAP_OBJECT_CLICK_LAYER_IDS: string[] = [
  SERVICE_ASSETS_LAYER_ID,
  SERVICE_ASSETS_SYMBOL_LAYER_ID,
  SERVICE_ASSETS_CLUSTER_LAYER_ID,
  SERVICE_ASSETS_CLUSTER_COUNT_LAYER_ID,
  SERVICE_ASSETS_LABEL_LAYER_ID,
  SERVICE_MOVERS_LAYER_ID,
  SERVICE_MOVERS_LABEL_LAYER_ID,
  SERVICE_ENEMY_LAYER_ID,
  SERVICE_SCENARIO_ENEMY_SYMBOL_LAYER_ID,
  SERVICE_ALLY_LAYER_ID,
  SERVICE_NEUTRAL_LAYER_ID,
  SERVICE_SCENARIO_LABEL_LAYER_ID,
  SERVICE_SAR2_ZONE_FILL_LAYER_ID,
  SERVICE_SAR2_ZONE_LINE_LAYER_ID,
  SERVICE_GRD_MOTION_FILL_LAYER_ID,
  SERVICE_GROUND_RADAR_COVERAGE_FILL_LAYER_ID,
  SERVICE_GROUND_RADAR_COVERAGE_LINE_LAYER_ID,
  SERVICE_GROUND_RADAR_COVERAGE_SCAN_LAYER_ID,
  SERVICE_GROUND_RADAR_CORRIDOR_FILL_LAYER_ID,
  SERVICE_GROUND_RADAR_CORRIDOR_5_FILL_LAYER_ID,
  SERVICE_GROUND_RADAR_ALT_AXIS_LAYER_ID,
  SERVICE_GROUND_RADAR_ALT_AXIS_5_LAYER_ID,
  SERVICE_GROUND_RADAR_PAST_TRACK_LAYER_ID,
  SERVICE_GROUND_RADAR_PAST_POINT_LAYER_ID,
  SERVICE_GROUND_RADAR_PAST_TRACK_5_LAYER_ID,
  SERVICE_GROUND_RADAR_PAST_POINT_5_LAYER_ID,
  SERVICE_GROUND_RADAR_RISK_FILL_LAYER_ID,
  SERVICE_GROUND_RADAR_RISK_SHORTEST_FILL_LAYER_ID,
  SERVICE_GROUND_RADAR_PREDICT_ENDPOINT_LAYER_ID,
  SERVICE_GROUND_RADAR_PREDICT_LAYER_ID,
  SERVICE_GROUND_RADAR_PREDICT_SHORTEST_ENDPOINT_LAYER_ID,
  SERVICE_GROUND_RADAR_PREDICT_SHORTEST_LAYER_ID,
  SERVICE_ENEMY_ROUTE_HIT_LAYER_ID,
  SERVICE_FMCW_RISK_FILL_LAYER_ID,
  SERVICE_FMCW_INGRESS_LINE_LAYER_ID,
  SERVICE_FMCW_TRACK_LAYER_ID,
  /** VoD 위험 E2E 오버레이 (RiskOverlayLayer) */
  'risk-e2e-zone-fill-layer',
  'risk-e2e-zone-line-layer',
  'risk-e2e-track-layer',
]

const GOOGLE_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    google: {
      type: 'raster',
      tiles: ['https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}'],
      tileSize: 256,
      attribution: 'Google Satellite',
      maxzoom: 21,
    },
  },
  layers: [
    {
      id: 'google-satellite',
      type: 'raster',
      source: 'google',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
}

type MapVideoModalState = {
  title: string
  subtitle?: string
  videoUrl: string | null
  /** 적 표적: 전차 집결 영상 팝업 하단에 UAV 출동 */
  enemyIntelMode?: boolean
}

/** 적 핀 클릭 팝업용 — public/media 전차 검출 시연 영상 */
const ENEMY_TANK_ASSEMBLY_VIDEO_URL = '/media/yolo-tank-1.mp4'

function enemyIntelVideoModalState(enemy: {
  codename: string
  threatLevel: string
  enemyBranch: string
}): MapVideoModalState {
  return {
    title: enemy.codename,
    subtitle: `적군 · ${enemy.threatLevel} · ${enemy.enemyBranch} · 전차 집결 정찰`,
    videoUrl: ENEMY_TANK_ASSEMBLY_VIDEO_URL,
    enemyIntelMode: true,
  }
}

type TacticRecommendation = {
  unitName: string
  suitabilityPct: number
  rationale: string
  payload: Record<string, unknown> | null
}

type ScenarioV2Phase =
  | 'sat-watch'
  | 'sat-wide-pause'
  | 'uav-transit'
  | 'uav-track-only'
  | 'tactical-mid'
  | 'fmcw-drone-transit'
  | 'tactics'

type AppLayoutProps = {
  user: User | null
  onLogout: () => void
}

type UnitLevel = '소대' | '중대' | '대대'

type TacticalSymbol =
  | 'INFANTRY'
  | 'ARTILLERY'
  | 'ARMOR'
  | 'MECHANIZED_INFANTRY'
  | 'RECON'
  | 'ENGINEER'
  | 'ADA'

type TacticalLocationStatus = 'CURRENT' | 'PLANNED'

type StrengthModifier = 'NONE' | 'REINFORCED' | 'REDUCED'

type EnemyTacticalSymbol = 'ENEMY_UNIT' | 'ENEMY_STRONGPOINT'

type FriendlyUnit = {
  id: number
  name: string
  level: UnitLevel
  unitCode?: string | null
  branch: string
  lat: number
  lng: number
  formation?: string | null
  elevationM?: number | null
  mgrs?: string | null
  personnel: number
  equipment: string
  readiness: '양호' | '경계' | '최고'
  mission: string
  symbolType: TacticalSymbol
  locationStatus: TacticalLocationStatus
  strengthModifier: StrengthModifier
  situationVideoUrl: string | null
}

type FriendlyUnitFromApi = Omit<FriendlyUnit, 'situationVideoUrl'> & {
  situationVideoUrl?: string | null
}

type UavDispatchAsset = {
  id: number
  name: string
  lat: number
  lng: number
  mgrs: string | null
  readiness: FriendlyUnit['readiness']
  mission: string
  equipment: string | null
  personnel: number | null
  formation: string | null
}

type UavDispatchTarget = {
  kind: 'grd' | 'enemy'
  title: string
  summary: string
  lat: number
  lng: number
  motionId?: string
  enemyId?: number | null
  enemyName?: string
}

type UavDispatchCandidate = UavDispatchAsset & {
  distanceKm: number
  etaMin: number
  inRange: boolean
  totalScore: number
  reasons: string[]
}

const UAV_DISPATCH_SPEED_KPH = 140

function formatEtaMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0.25) return '1분 이내'
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)}시간`
  return `${minutes.toFixed(1)}분`
}

function keywordHitCount(text: string, keywords: readonly string[]): number {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0)
}

function nearestUavDispatchDistanceKm(
  assets: Array<Pick<UavDispatchAsset, 'lat' | 'lng'>>,
  target: { lat: number; lng: number },
): number | null {
  if (assets.length === 0) return null
  return Math.min(...assets.map((asset) => haversineKm(asset, target)))
}

function buildUavDispatchCandidates(
  assets: UavDispatchAsset[],
  target: UavDispatchTarget,
): UavDispatchCandidate[] {
  if (assets.length === 0) return []

  const maxPersonnel = Math.max(...assets.map((asset) => asset.personnel ?? 0), 1)
  const missionKeywords =
    target.kind === 'grd'
      ? (['실시간', '데이터링크', '고고도', 'EO/IR', 'EOIR', '통합'] as const)
      : (['추적', '실시간', '데이터링크', 'EO/IR', 'EOIR', '통합'] as const)

  return assets
    .map((asset) => {
      const distanceKm = haversineKm(asset, target)
      const etaMin = (distanceKm / UAV_DISPATCH_SPEED_KPH) * 60
      const inRange = distanceKm <= GRD_DISPATCH_RANGE_KM
      const readinessScore =
        asset.readiness === '최고' ? 24 : asset.readiness === '경계' ? 17 : 11
      const distanceScore = Math.max(
        0,
        52 - (distanceKm / GRD_DISPATCH_RANGE_KM) * 52,
      )
      const missionText = `${asset.mission} ${asset.equipment ?? ''}`
      const missionScore = Math.min(
        16,
        keywordHitCount(missionText, missionKeywords) * 4 +
          (missionText.includes('정찰') ? 2 : 0),
      )
      const staffingScore =
        asset.personnel != null ? Math.min(8, (asset.personnel / maxPersonnel) * 8) : 0
      const overRangePenalty = inRange
        ? 0
        : Math.min(30, 12 + (distanceKm - GRD_DISPATCH_RANGE_KM) * 2.2)
      const totalScore = Math.max(
        0,
        Math.min(100, distanceScore + readinessScore + missionScore + staffingScore - overRangePenalty),
      )

      const reasons = [
        `목표까지 ${distanceKm.toFixed(1)}km, 예상 도착 ${formatEtaMinutes(etaMin)}`,
        asset.readiness === '최고'
          ? '준비태세 최고'
          : asset.readiness === '경계'
            ? '준비태세 경계 유지'
            : '기본 준비태세 확보',
      ]

      if (missionScore >= 10) {
        reasons.push(
          target.kind === 'grd'
            ? '광역 EO/IR 재탐색에 적합한 임무·장비'
            : '표적 추적형 EO/IR 임무에 적합한 장비',
        )
      } else if (asset.equipment) {
        reasons.push(`탑재 장비: ${asset.equipment}`)
      }

      if (asset.personnel != null && asset.personnel / maxPersonnel >= 0.9) {
        reasons.push('운용 인원 여유가 큰 편')
      }

      return {
        ...asset,
        distanceKm,
        etaMin,
        inRange,
        totalScore,
        reasons,
      }
    })
    .sort(
      (a, b) =>
        Number(b.inRange) - Number(a.inRange) ||
        b.totalScore - a.totalScore ||
        a.distanceKm - b.distanceKm,
    )
}

/** DB 시드 없이도 프로필명으로 출전 부대 매핑(폴백) */
function fallbackTacticDeployUnitNames(tacticProfileName: string): string[] {
  const n = tacticProfileName.trim()
  if (n.startsWith('부대1')) return ['3기갑소대']
  if (n.startsWith('부대2')) return ['1보병중대 (전방)']
  if (n.startsWith('부대3')) return ['2포병포대']
  return []
}

function resolveTacticDeployUnitIds(
  tacticProfileName: string,
  payload: Record<string, unknown> | null,
  units: FriendlyUnit[],
): number[] {
  let names: string[] = []
  if (payload && Array.isArray(payload.deployUnitNames)) {
    names = payload.deployUnitNames.filter((x): x is string => typeof x === 'string')
  }
  if (names.length === 0) {
    names = fallbackTacticDeployUnitNames(tacticProfileName)
  }
  const ids: number[] = []
  for (const name of names) {
    const u = units.find((fu) => fu.name === name)
    if (u) ids.push(u.id)
  }
  return ids
}

type EnemyInfiltration = {
  id: number
  codename: string
  lat: number
  lng: number
  threatLevel: '낮음' | '중간' | '높음'
  estimatedCount: number
  observedAt: string
  riskRadiusMeter: number
  droneVideoUrl: string
  enemySymbol: EnemyTacticalSymbol
  enemyBranch: string
}

/** 백엔드 /map/radar/snapshot — FMCW(근거리·위상·예측 궤적) */
type RadarSnapshot = {
  fmcw: {
    radar: {
      id: string
      label: string
      lat: number
      lng: number
      rangeMaxM: number
      fovDeg: number
      headingDeg: number
      elevationBeamDeg: number
    }
    meta: {
      sensor: 'FMCW'
      representationNote: string
      vodReferenceNote: string
      methodology: {
        scenarioNote: string
        poseAndDistanceNote: string
        preprocessingNote: string
        trainingNote: string
        demoImplementationNote: string
      }
      liveRun?: {
        ok: boolean
        frameId?: string
        prevFrameId?: string
        inferMs?: number
        radarPipeline?: string
        radarPointCount?: number
        error?: string
      } | null
    }
    detections: Array<{
      id: string
      lat: number
      lng: number
      rangeM: number
      azimuthDeg: number
      elevationDeg: number
      dopplerMps: number
      confidence: number
      phaseDeg: number
    }>
    track: {
      bearingDeg: number
      phaseRefDeg: number
      predictedPath: Array<{ lat: number; lng: number }>
    } | null
    insights?: {
      frameId?: string
      yoloModel?: string
      annotatedImageBase64?: string | null
      yoloDetections?: Array<{ label: string; confidence: number; bbox: number[] }>
      primaryObject?: { label: string; confidence: number } | null
      lidarValidation?: {
        matched?: boolean
        pointsInRoi?: number
        deltaRangeM?: number | null
        deltaBearingDeg?: number | null
        verdict?: string
        lidarClusterRangeM?: number | null
        radarRangeM?: number | null
        iouBevProxy?: number
        meanDistanceM?: number | null
      } | null
      conclusionBullets?: string[]
      lidarReviewParagraph?: string
      syncedViewNote?: string
      vodProvenance?: {
        datasetRootHint?: string
        syncedFrameCount?: number
        dataSources: string[]
        pipelineLine: string
      }
      vodMatchedTarget?: {
        className?: string
        matchDistanceM?: number
        centerM?: [number, number, number]
        headingDegEgoXY?: number
        headingNote?: string
        lengthM?: number
        widthM?: number
      } | null
      vodRiskZones?: Array<{
        id: string
        label: string
        rationale: string
        polygon: Array<{ lat: number; lng: number }>
      }>
      vodStoryParagraph?: string
      lidarCrossChecks?: Array<{
        rank: number
        clusterId: string
        matched?: boolean
        pointsInRoi?: number
        verdict?: string
        deltaRangeM?: number | null
        deltaBearingDeg?: number | null
      }>
      motionAnalysis?: {
        frameDeltaS?: number
        trackGateM?: number
        associations?: number
        prevClusterCount?: number
        note?: string
      }
      ruleBasedRiskPrimary?: {
        score?: number
        level?: string
        factors?: Record<string, number>
      }
      riskModel?: { mode?: string; note?: string }
      futureTrajectoryLatLng?: Array<{ lat: number; lng: number }>
    } | null
  }
}

type CameraDevice = {
  deviceId: string
  label: string
}

type YoloDetection = {
  label: string
  confidence: number
  bbox: [number, number, number, number]
  trackId: number | null
}

type YoloInferenceResponse = {
  source: string
  detections: YoloDetection[]
  annotatedImageBase64?: string
  message?: string
}

type VideoFrameResult = {
  frameIndex: number
  timestampSec: number
  detections: YoloDetection[]
}

type YoloVideoInferenceResponse = {
  source: string
  fps: number
  totalFrames: number
  sampledFrames: number
  totalDetections: number
  countsByLabel: Record<string, number>
  frameResults: VideoFrameResult[]
  previewFramesBase64: string[]
  message?: string
}

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

const UNIT_LEVEL_MARKER_COLOR: Record<UnitLevel, string> = {
  소대: '#1d4ed8',
  중대: '#0369a1',
  대대: '#065f46',
}

const TACTICAL_SYMBOL_LABEL: Record<TacticalSymbol, string> = {
  INFANTRY: '보병(X)',
  ARTILLERY: '포병(점)',
  ARMOR: '기갑(타원)',
  MECHANIZED_INFANTRY: '기계화',
  RECON: '정찰',
  ENGINEER: '공병',
  ADA: '방공',
}

const LOCATION_STATUS_LABEL: Record<TacticalLocationStatus, string> = {
  CURRENT: '현재 지점',
  PLANNED: '예정 지점',
}

const STRENGTH_LABEL: Record<StrengthModifier, string> = {
  NONE: '',
  REINFORCED: '증강 (+)',
  REDUCED: '감소 (-)',
}

const ECHELON_SHORT: Record<UnitLevel, string> = {
  소대: '소',
  중대: '중',
  대대: '대',
}

const FRIENDLY_GLYPH_SVG: Record<TacticalSymbol, string> = {
  INFANTRY: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><line x1="4" y1="4" x2="24" y2="16" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/><line x1="24" y1="4" x2="4" y2="16" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>`,
  ARTILLERY: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><circle cx="14" cy="10" r="3.8" fill="currentColor"/></svg>`,
  ARMOR: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><ellipse cx="14" cy="10" rx="10" ry="5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  MECHANIZED_INFANTRY: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><rect x="5" y="4" width="18" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="14" cy="13" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  RECON: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><circle cx="14" cy="10" r="2.4" fill="currentColor"/><circle cx="14" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  ENGINEER: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><path d="M6 15 L14 5 L22 15 Z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="10" y1="11" x2="18" y2="11" stroke="currentColor" stroke-width="1.5"/></svg>`,
  ADA: `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><path d="M4 15 L14 5 L24 15 Z" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
}

function getEnemyGlyphInnerHTML(enemy: EnemyInfiltration): string {
  if (enemy.enemySymbol === 'ENEMY_STRONGPOINT') {
    return `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><path d="M3 16 Q14 3 25 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`
  }
  return `<svg viewBox="0 0 28 20" class="tactical-glyph-svg" aria-hidden="true"><rect x="7" y="6" width="14" height="8" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`
}

function buildFriendlyTacticalPinHTML(unit: FriendlyUnit): string {
  const sym = unit.symbolType.toLowerCase().replace(/_/g, '-')
  const loc = unit.locationStatus === 'PLANNED' ? 'planned' : 'current'
  const str = unit.strengthModifier.toLowerCase().replace(/_/g, '-')
  const glyph = FRIENDLY_GLYPH_SVG[unit.symbolType] ?? FRIENDLY_GLYPH_SVG.INFANTRY
  const ticksClass =
    unit.strengthModifier === 'REINFORCED'
      ? 'tactical-marker__ticks tactical-marker__ticks--reinforced'
      : unit.strengthModifier === 'REDUCED'
        ? 'tactical-marker__ticks tactical-marker__ticks--reduced'
        : 'tactical-marker__ticks tactical-marker__ticks--none'
  return `
    <div class="tactical-marker tactical-marker--friendly tactical-marker--sym-${sym} tactical-marker--loc-${loc} tactical-marker--str-${str}">
      <div class="${ticksClass}" aria-hidden="true"></div>
      <div class="tactical-marker__frame">${glyph}</div>
      <span class="tactical-marker__echelon">${ECHELON_SHORT[unit.level]}</span>
      <span class="tactical-marker__friendly-pos-label">아군 위치</span>
    </div>
  `
}

function buildEnemyTacticalPinHTML(enemy: EnemyInfiltration): string {
  const variant =
    enemy.enemySymbol === 'ENEMY_STRONGPOINT' ? 'strongpoint' : 'unit'
  const glyph = getEnemyGlyphInnerHTML(enemy)
  return `
    <div class="enemy-pin-wrap" aria-label="적 표적">
      <div class="tactical-marker tactical-marker--enemy tactical-marker--enemy-${variant}">
        <div class="tactical-marker__ticks tactical-marker__ticks--none" aria-hidden="true"></div>
        <div class="tactical-marker__frame tactical-marker__frame--double">${glyph}</div>
        <span class="tactical-marker__echelon tactical-marker__echelon--enemy">적</span>
      </div>
    </div>
  `
}

const THREAT_COLOR: Record<EnemyInfiltration['threatLevel'], string> = {
  낮음: '#15803d',
  중간: '#b45309',
  높음: '#b91c1c',
}

/** 시뮬레이션 궤적 키프레임 수 */
const SIM_PATH_STEPS = 200
/** 1배속일 때 재생에 걸리는 시간(초) */
const SIM_DURATION_SEC = 45
/** 4단계 통합 시뮬 진입 직후, 적·아군 초기 위치만 보여 주는 시간(ms) */
const SIM_INTRO_POSITIONS_MS = 3000
/** 인트로 종료 후 SAR 손실 경고 배너 자동 숨김(ms) — 확인 버튼으로도 닫을 수 있음 */
const SIM_SAR_LOSS_ALERT_AUTO_DISMISS_MS = 12000
const SAR_UPDATE_INTERVAL_HOURS = 2
const UAV_TRANSIT_PROGRESS_SPAN = 0.11
const DRONE_TRANSIT_PROGRESS_SPAN = 0.11

function formatSimClock(progress: number, durationSec: number): string {
  const clamped = Math.max(0, Math.min(1, progress))
  const totalSec = Math.round(clamped * durationSec)
  const m = Math.floor(totalSec / 60)
  const r = totalSec % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

type SimPoint = { lat: number; lng: number }

type SimPathBundle = {
  friendly: Map<number, SimPoint[]>
  enemy: Map<number, SimPoint[]>
}

/** 아군: 시뮬 재생 중에도 초기 좌표 고정(이동 없음) */
function buildFriendlyPath(baseLat: number, baseLng: number, _seed: number): SimPoint[] {
  const p: SimPoint = { lat: baseLat, lng: baseLng }
  return Array.from({ length: SIM_PATH_STEPS + 1 }, () => ({ ...p }))
}

function buildEnemyPath(baseLat: number, baseLng: number, seed: number): SimPoint[] {
  const out: SimPoint[] = []
  const driftLat = -0.22 * Math.sin(seed * 0.08 + 1.2)
  const driftLng = 0.28 * Math.cos(seed * 0.06 + 0.4)
  for (let i = 0; i <= SIM_PATH_STEPS; i += 1) {
    const t = i / SIM_PATH_STEPS
    out.push({
      lat: baseLat + driftLat * t + 0.05 * Math.sin(t * Math.PI * 7 + seed * 0.11),
      lng: baseLng + driftLng * t + 0.04 * Math.cos(t * Math.PI * 6 + seed * 0.13),
    })
  }
  return out
}

/**
 * 구간 단일 대원호(slerp) + smoothstep — OSRM 폴백·연쇄 궤적의 한 레그로 사용.
 */
function buildGreatCircleInvasionPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  _seed: number,
): SimPoint[] {
  const φ1 = (fromLat * Math.PI) / 180
  const λ1 = (fromLng * Math.PI) / 180
  const φ2 = (toLat * Math.PI) / 180
  const λ2 = (toLng * Math.PI) / 180
  const sinD = Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
  )
  const d = 2 * Math.asin(Math.min(1, sinD))
  const out: SimPoint[] = []
  for (let i = 0; i <= SIM_PATH_STEPS; i += 1) {
    const u = i / SIM_PATH_STEPS
    const t = u * u * (3 - 2 * u)
    if (d < 1e-9) {
      out.push({ lat: fromLat, lng: fromLng })
      continue
    }
    const a = Math.sin((1 - t) * d) / Math.sin(d)
    const b = Math.sin(t * d) / Math.sin(d)
    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2)
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2)
    const z = a * Math.sin(φ1) + b * Math.sin(φ2)
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI
    const lng = (Math.atan2(y, x) * 180) / Math.PI
    out.push({ lat, lng })
  }
  return out
}

/** 함흥→평양→최종 목표(서울) 폴백 궤적 — OSRM 실패·로딩 전 즉시 표시 */
function buildChainedGreatCircleInvasionPath(
  ham: SimPoint,
  py: SimPoint,
  dest: SimPoint,
  seed: number,
): SimPoint[] {
  const leg1 = buildGreatCircleInvasionPath(ham.lat, ham.lng, py.lat, py.lng, seed)
  const leg2 = buildGreatCircleInvasionPath(py.lat, py.lng, dest.lat, dest.lng, seed + 31)
  const merged = [...leg1.slice(0, -1), ...leg2]
  return resamplePolyline(merged, SIM_PATH_STEPS)
}

function buildSimPaths(
  units: FriendlyUnit[],
  enemies: EnemyInfiltration[],
): SimPathBundle {
  const friendly = new Map<number, SimPoint[]>()
  const enemy = new Map<number, SimPoint[]>()
  const inv = BATTALION_SCENARIO.invasionTarget
  const primary = pickPrimaryEnemyForDistance(enemies)
  units.forEach((u) => {
    friendly.set(u.id, buildFriendlyPath(u.lat, u.lng, u.id * 17 + u.name.length))
  })
  const hamOrigin = BATTALION_HAMHUNG_INVASION_ORIGIN
  const pyWaypoint = BATTALION_PYONGYANG_INVASION_ORIGIN
  enemies.forEach((e) => {
    if (primary && e.id === primary.id) {
      enemy.set(
        e.id,
        buildChainedGreatCircleInvasionPath(
          { lat: hamOrigin.lat, lng: hamOrigin.lng },
          { lat: pyWaypoint.lat, lng: pyWaypoint.lng },
          { lat: inv.lat, lng: inv.lng },
          e.id * 23 + e.codename.length,
        ),
      )
    } else {
      enemy.set(e.id, buildEnemyPath(e.lat, e.lng, e.id * 23 + e.codename.length))
    }
  })
  return { friendly, enemy }
}

function samplePath(path: SimPoint[], progress: number): SimPoint {
  if (path.length === 0) return { lat: 0, lng: 0 }
  const p = Math.min(1, Math.max(0, progress))
  const idx = p * (path.length - 1)
  const i0 = Math.floor(idx)
  const i1 = Math.min(i0 + 1, path.length - 1)
  const a = idx - i0
  const A = path[i0]
  const B = path[i1]
  return {
    lat: A.lat + (B.lat - A.lat) * a,
    lng: A.lng + (B.lng - A.lng) * a,
  }
}

/** 궤적 접선 방향(북 0° 시계방향) — 시뮬 시점 표적 이동 헤딩 */
function movementBearingAlongPath(path: SimPoint[], progress: number): number | null {
  if (path.length < 2) return null
  const p = Math.min(1, Math.max(0, progress))
  const delta = Math.max(0.002, 1 / Math.max(8, path.length * 3))
  const p2 = Math.min(1, p + delta)
  if (p2 <= p + 1e-9) return null
  const A = samplePath(path, p)
  const B = samplePath(path, p2)
  return bearingDeg(A.lat, A.lng, B.lat, B.lng)
}

function bearingToCardinalKo(deg: number): string {
  const x = ((deg % 360) + 360) % 360
  const labels = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] as const
  return labels[Math.round(x / 45) % 8]
}

function haversineKm(a: SimPoint, b: SimPoint): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la = (a.lat * Math.PI) / 180
  const lb = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function pathTotalLengthKm(path: SimPoint[]): number {
  if (path.length < 2) return 0
  let s = 0
  for (let i = 1; i < path.length; i += 1) {
    s += haversineKm(path[i - 1]!, path[i]!)
  }
  return s
}

/** 시뮬 시계 기준 궤적 접선 속도(km/h) — 아군 고정 궤적이면 0에 가깝게 */
function speedAlongPathKmH(path: SimPoint[], progress: number): number | null {
  if (path.length < 2) return null
  const totalKm = pathTotalLengthKm(path)
  if (totalKm >= TANK_INVASION_PATH_LENGTH_THRESHOLD_KM) {
    const wobble = 4 * Math.sin(progress * Math.PI * 2.5 + path.length * 0.07)
    return Math.max(18, TANK_ROAD_MARCH_SPEED_KMH + wobble)
  }
  const eps = 0.01
  const p = Math.min(1, Math.max(0, progress))
  const p0 = Math.max(0, p - eps)
  const p1 = Math.min(1, p + eps)
  if (p1 <= p0 + 1e-9) return null
  const A = samplePath(path, p0)
  const B = samplePath(path, p1)
  const distKm = haversineKm(A, B)
  const deltaSimSec = (p1 - p0) * SIM_DURATION_SEC
  if (deltaSimSec < 1e-9) return null
  return (distKm / deltaSimSec) * 3600
}

/** DEM 미연동 시 지도용 합성 표고(m) */
function syntheticElevationM(lat: number, lng: number, salt: number): number {
  const wobble =
    Math.sin(lat * 71.3 + salt * 0.09) * Math.cos(lng * 63.7 - salt * 0.05)
  return Math.round(95 + wobble * 220 + (Math.abs(salt) % 41) * 2)
}

/** 전장 서비스 우측 패널 — 선택 객체 표고(DB 우선, 없으면 합성) */
function battlefieldPanelElevationM(d: SelectedObjectDetail): number {
  if (d.elevationM != null && Number.isFinite(d.elevationM)) {
    return Math.round(d.elevationM)
  }
  let h = 0
  for (let i = 0; i < d.title.length; i += 1) h = (h * 31 + d.title.charCodeAt(i)) >>> 0
  const aff =
    d.affiliation === '적' ? 13 : d.affiliation === '아군' ? 7 : d.affiliation === '우군' ? 11 : 17
  return syntheticElevationM(d.lat, d.lng, (h % 40000) + aff)
}

function createLiveKinematicsInfowindow(
  kakaoMaps: KakaoMapsApi,
  map: KakaoMap,
  position: unknown,
  pinEl: HTMLElement,
  options: {
    kind: 'friendly' | 'enemy'
    title: string
    simPathsRef: MutableRefObject<SimPathBundle | null>
    simProgressRef: MutableRefObject<number>
    pathKey: 'friendly' | 'enemy'
    entityId: number
    onSelect: () => void
    onPinMouseEnterExtra?: () => void
    onPinMouseLeaveExtra?: () => void
  },
): KakaoCustomOverlayInstance {
  const elevSalt = options.entityId * 997 + (options.kind === 'enemy' ? 13 : 0)
  const infoContent = document.createElement('div')
  const sideClass =
    options.kind === 'friendly'
      ? 'map-hover-side-card--friendly'
      : 'map-hover-side-card--enemy'
  infoContent.className = `ais-map-tooltip unit-map-overlay map-hover-side-card ${sideClass}`
  const badge = options.kind === 'friendly' ? '아군' : '적'
  infoContent.innerHTML = `
    <span class="ais-map-tooltip__badge">${badge}</span>
    <h4 class="ais-map-tooltip__title"></h4>
    <p class="ais-map-tooltip__row"><strong>이동속도</strong> <span data-k="spd">—</span></p>
    <p class="ais-map-tooltip__row"><strong>좌표(WGS84)</strong> <span data-k="pos">—</span></p>
    <p class="ais-map-tooltip__row"><strong>MGRS</strong> <span data-k="mgrs">—</span></p>
    <p class="ais-map-tooltip__row"><strong>표고</strong> <span data-k="elev">—</span></p>
  `
  const titleEl = infoContent.querySelector('.ais-map-tooltip__title')
  if (titleEl) titleEl.textContent = options.title

  const spdEl = infoContent.querySelector('[data-k="spd"]')
  const posEl = infoContent.querySelector('[data-k="pos"]')
  const mgrsEl = infoContent.querySelector('[data-k="mgrs"]')
  const elevEl = infoContent.querySelector('[data-k="elev"]')

  const refresh = () => {
    const bundle = options.simPathsRef.current
    const path =
      options.pathKey === 'friendly'
        ? bundle?.friendly.get(options.entityId)
        : bundle?.enemy.get(options.entityId)
    const pr = options.simProgressRef.current
    if (!path || path.length === 0) {
      if (spdEl) spdEl.textContent = '—'
      if (posEl) posEl.textContent = '—'
      if (mgrsEl) mgrsEl.textContent = '—'
      if (elevEl) elevEl.textContent = '—'
      return
    }
    const { lat, lng } = samplePath(path, pr)
    const spd = speedAlongPathKmH(path, pr)
    const elev = syntheticElevationM(lat, lng, elevSalt)
    if (spdEl) spdEl.textContent = spd != null ? `${spd.toFixed(1)} km/h` : '—'
    if (posEl) posEl.textContent = formatLatLngReadout(lat, lng)
    if (mgrsEl) mgrsEl.textContent = latLngToMgrsSafe(lat, lng)
    if (elevEl) elevEl.textContent = `${elev} m`
  }

  const infoOverlay = new kakaoMaps.CustomOverlay({
    position,
    yAnchor: 0.5,
    xAnchor: 0,
    content: infoContent,
    zIndex: 4,
  })
  infoOverlay.setMap(null)

  let infoHideTimer: number | null = null
  let tickTimer: number | null = null

  const clearInfoHide = () => {
    if (infoHideTimer != null) {
      window.clearTimeout(infoHideTimer)
      infoHideTimer = null
    }
  }

  const clearTick = () => {
    if (tickTimer != null) {
      window.clearInterval(tickTimer)
      tickTimer = null
    }
  }

  const scheduleInfoHide = () => {
    clearInfoHide()
    infoHideTimer = window.setTimeout(() => {
      infoOverlay.setMap(null)
      clearTick()
      infoHideTimer = null
    }, 180)
  }

  pinEl.addEventListener('mouseenter', () => {
    options.onPinMouseEnterExtra?.()
    clearInfoHide()
    refresh()
    clearTick()
    tickTimer = window.setInterval(refresh, 120)
    infoOverlay.setMap(map)
  })
  pinEl.addEventListener('mouseleave', () => {
    scheduleInfoHide()
    options.onPinMouseLeaveExtra?.()
  })
  infoContent.addEventListener('mouseenter', clearInfoHide)
  infoContent.addEventListener('mouseleave', scheduleInfoHide)

  pinEl.addEventListener('click', (ev) => {
    ev.stopPropagation()
    clearInfoHide()
    clearTick()
    infoOverlay.setMap(null)
    options.onSelect()
  })

  return infoOverlay
}

/** 시뮬 진행 시점에서 지휘통제실–우선 적 거리(km) */
function enemyDistanceFromC2Km(
  paths: SimPathBundle | null,
  progress: number,
  c2Id: number | null,
  enemyId: number | null,
): number | null {
  if (!paths || c2Id == null || enemyId == null) return null
  const c2Path = paths.friendly.get(c2Id)
  const ePath = paths.enemy.get(enemyId)
  if (!c2Path || !ePath) return null
  const a = samplePath(c2Path, progress)
  const b = samplePath(ePath, progress)
  return haversineKm(a, b)
}

/** C2–적 구간 주변만 보이도록 바운드(전술 PiP 확대용) */
function tightBoundsAroundC2Enemy(c2: SimPoint, enemy: SimPoint, padKm: number): { sw: SimPoint; ne: SimPoint } {
  const minSpanLat = 0.038
  const minSpanLng = 0.048
  let minLat = Math.min(c2.lat, enemy.lat)
  let maxLat = Math.max(c2.lat, enemy.lat)
  let minLng = Math.min(c2.lng, enemy.lng)
  let maxLng = Math.max(c2.lng, enemy.lng)
  const midLat = (minLat + maxLat) / 2
  const padLat = padKm / 111
  const padLng = padKm / (111 * Math.cos((midLat * Math.PI) / 180))
  if (maxLat - minLat < minSpanLat) {
    const h = minSpanLat / 2
    minLat = midLat - h
    maxLat = midLat + h
  }
  if (maxLng - minLng < minSpanLng) {
    const midLng = (minLng + maxLng) / 2
    const w = minSpanLng / 2
    minLng = midLng - w
    maxLng = midLng + w
  }
  return {
    sw: { lat: minLat - padLat, lng: minLng - padLng },
    ne: { lat: maxLat + padLat, lng: maxLng + padLng },
  }
}

function offsetLatLng(lat: number, lng: number, bearingDeg: number, distKm: number): SimPoint {
  const R = 6371
  const brng = (bearingDeg * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lng1 = (lng * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distKm / R) +
      Math.cos(lat1) * Math.sin(distKm / R) * Math.cos(brng),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distKm / R) * Math.cos(lat1),
      Math.cos(distKm / R) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI }
}

/** 카카오맵에 겹칠 두 궤적이 동일하면 한 레이어만 그리기 위한 비교 */
function latLngPolylineAlmostEqual(
  a: Array<{ lat: number; lng: number }>,
  b: Array<{ lat: number; lng: number }>,
  eps = 1e-7,
): boolean {
  if (a.length !== b.length || a.length < 2) return false
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i]!
    const q = b[i]!
    if (Math.abs(p.lat - q.lat) > eps || Math.abs(p.lng - q.lng) > eps) return false
  }
  return true
}

/** 도로 폴리라인을 시뮬레이션 스텝 수로 균등 리샘플 (이동 속도 체감 일정) */
function resamplePolyline(points: SimPoint[], numSamples: number): SimPoint[] {
  if (points.length === 0) return []
  if (points.length === 1) {
    return Array.from({ length: numSamples + 1 }, () => ({ ...points[0] }))
  }
  const cum: number[] = [0]
  for (let i = 1; i < points.length; i += 1) {
    cum[i] = cum[i - 1] + haversineKm(points[i - 1], points[i])
  }
  const total = cum[cum.length - 1]
  if (total < 1e-9) {
    return Array.from({ length: numSamples + 1 }, () => ({ ...points[0] }))
  }
  const out: SimPoint[] = []
  for (let j = 0; j <= numSamples; j += 1) {
    const target = (j / numSamples) * total
    let seg = 0
    while (seg < cum.length - 1 && cum[seg + 1] < target) seg += 1
    const segStart = cum[seg]
    const segEnd = cum[seg + 1]
    const t = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0
    const A = points[seg]
    const B = points[seg + 1]
    out.push({
      lat: A.lat + (B.lat - A.lat) * t,
      lng: A.lng + (B.lng - A.lng) * t,
    })
  }
  return out
}

/** OSRM driving 왕복(같은 도로로 복귀) → 닫힌 루프 궤적. 실패 시 합성 궤적. */
async function fetchRoadRoundTripPath(
  baseLat: number,
  baseLng: number,
  seed: number,
  isEnemy: boolean,
): Promise<{ points: SimPoint[]; fromRoad: boolean }> {
  const distKm = Math.max(
    2,
    isEnemy ? 2.5 + (Math.abs(seed) % 45) / 10 : 4 + (Math.abs(seed) % 70) / 10,
  )
  const bearing = (Math.abs(seed) * 47.13) % 360
  const dest = offsetLatLng(baseLat, baseLng, bearing, distKm)

  const routeUrl = (from: SimPoint, to: SimPoint) =>
    `${getApiBaseUrl()}/map/route/driving?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`

  try {
    const from = { lat: baseLat, lng: baseLng }
    const leg1 = await requestJson<{ coordinates: SimPoint[] }>(routeUrl(from, dest))
    const leg2 = await requestJson<{ coordinates: SimPoint[] }>(routeUrl(dest, from))
    const c1 = leg1.coordinates
    const c2 = leg2.coordinates
    if (!Array.isArray(c1) || c1.length < 2 || !Array.isArray(c2) || c2.length < 2) {
      throw new Error('empty route')
    }
    const merged = [...c1, ...c2.slice(1)]
    return { points: resamplePolyline(merged, SIM_PATH_STEPS), fromRoad: true }
  } catch {
    return {
      points: isEnemy
        ? buildEnemyPath(baseLat, baseLng, seed)
        : buildFriendlyPath(baseLat, baseLng, seed),
      fromRoad: false,
    }
  }
}

/** 주 적: 함흥→평양→서울 도로(OSRM 2구간 연결), 실패 시 대원호 연쇄 폴백 */
async function fetchRoadInvasionPath(
  ham: SimPoint,
  py: SimPoint,
  dest: SimPoint,
  seed: number,
): Promise<{ points: SimPoint[]; fromRoad: boolean }> {
  const routeUrl = (from: SimPoint, to: SimPoint) =>
    `${getApiBaseUrl()}/map/route/driving?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`

  try {
    const leg1 = await requestJson<{ coordinates: SimPoint[] }>(routeUrl(ham, py))
    const leg2 = await requestJson<{ coordinates: SimPoint[] }>(routeUrl(py, dest))
    const c1 = leg1.coordinates
    const c2 = leg2.coordinates
    if (!Array.isArray(c1) || c1.length < 2 || !Array.isArray(c2) || c2.length < 2) {
      throw new Error('empty invasion route leg')
    }
    const merged = [...c1, ...c2.slice(1)]
    return { points: resamplePolyline(merged, SIM_PATH_STEPS), fromRoad: true }
  } catch {
    return {
      points: buildChainedGreatCircleInvasionPath(ham, py, dest, seed),
      fromRoad: false,
    }
  }
}

async function buildRoadAwareSimPaths(
  units: FriendlyUnit[],
  enemies: EnemyInfiltration[],
): Promise<{ bundle: SimPathBundle; roadCount: number; total: number }> {
  const friendly = new Map<number, SimPoint[]>()
  const enemy = new Map<number, SimPoint[]>()
  let roadCount = 0
  const jobs: Array<Promise<void>> = []
  const primaryEnemy = pickPrimaryEnemyForDistance(enemies)
  const inv = BATTALION_SCENARIO.invasionTarget
  const hamOrigin = BATTALION_HAMHUNG_INVASION_ORIGIN
  const pyWaypoint = BATTALION_PYONGYANG_INVASION_ORIGIN

  units.forEach((u) => {
    friendly.set(u.id, buildFriendlyPath(u.lat, u.lng, u.id * 17 + u.name.length))
  })

  enemies.forEach((e) => {
    jobs.push(
      (async () => {
        if (primaryEnemy && e.id === primaryEnemy.id) {
          const { points, fromRoad } = await fetchRoadInvasionPath(
            { lat: hamOrigin.lat, lng: hamOrigin.lng },
            { lat: pyWaypoint.lat, lng: pyWaypoint.lng },
            { lat: inv.lat, lng: inv.lng },
            e.id * 23 + e.codename.length,
          )
          enemy.set(e.id, points)
          if (fromRoad) roadCount += 1
        } else {
          const { points, fromRoad } = await fetchRoadRoundTripPath(
            e.lat,
            e.lng,
            e.id * 23 + e.codename.length,
            true,
          )
          enemy.set(e.id, points)
          if (fromRoad) roadCount += 1
        }
      })(),
    )
  })

  const chunkSize = 3
  for (let i = 0; i < jobs.length; i += chunkSize) {
    await Promise.all(jobs.slice(i, i + chunkSize))
  }

  return {
    bundle: { friendly, enemy },
    roadCount,
    total: units.length + enemies.length,
  }
}

type KakaoMap = {
  setBounds: (
    bounds: unknown,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ) => void
  setLevel: (level: number) => void
  getLevel: () => number
  setZoomable: (zoomable: boolean) => void
}

type KakaoCustomOverlayInstance = {
  setMap: (map: KakaoMap | null) => void
  setPosition: (position: unknown) => void
  getMap?: () => KakaoMap | null
}

type KakaoCircleInstance = {
  setMap: (map: KakaoMap | null) => void
  setOptions?: (options: { center?: unknown }) => void
  setPosition?: (position: unknown) => void
}

type KakaoPolygonInstance = {
  setMap: (map: KakaoMap | null) => void
  setPath?: (path: unknown[]) => void
}

type KakaoPolylineInstance = {
  setMap: (map: KakaoMap | null) => void
  setPath?: (path: unknown[]) => void
}

type MapScene = {
  kakaoMaps: KakaoMapsApi
  map: KakaoMap
  units: Array<{
    id: number
    pin: KakaoCustomOverlayInstance
    info: KakaoCustomOverlayInstance
    pinEl: HTMLDivElement
  }>
  enemies: Array<{
    id: number
    pin: KakaoCustomOverlayInstance
    info: KakaoCustomOverlayInstance
    circle: KakaoCircleInstance
    pinEl: HTMLDivElement
  }>
  radarDisposables?: Array<
    KakaoPolygonInstance | KakaoCustomOverlayInstance | KakaoCircleInstance | KakaoPolylineInstance
  >
  /** 작은 지도: 지휘통제실–주 적 표적 거리선 */
  c2EnemyLine?: KakaoPolylineInstance
  distanceLabelOverlay?: KakaoCustomOverlayInstance
  distanceLabelEl?: HTMLDivElement
  droneAssetOverlay?: KakaoCustomOverlayInstance
  droneAssetEl?: HTMLDivElement
  c2UnitId?: number
  primaryEnemyId?: number
  /** 광역: 평양 소실·남하 권역 표시 타이밍 동기화(진행률 인자는 호환용) */
  battalionRegionsSync?: (simProgress: number) => void
}

/** 북 기준 시계방향 방위각(도) + 거리(m) → 위경도 */
function polarToLatLngWeb(
  originLat: number,
  originLng: number,
  rangeM: number,
  azimuthDegFromNorth: number,
): { lat: number; lng: number } {
  const rad = (azimuthDegFromNorth * Math.PI) / 180
  const dN = rangeM * Math.cos(rad)
  const dE = rangeM * Math.sin(rad)
  const lat = originLat + dN / 111320
  const lng = originLng + dE / (111320 * Math.cos((originLat * Math.PI) / 180))
  return { lat, lng }
}

/** 레이더 시야(부채꼴) 폴리곤 꼭짓점 — 카카오 LatLng 배열로 변환 전 */
function buildRadarSectorPath(
  centerLat: number,
  centerLng: number,
  radiusM: number,
  headingDeg: number,
  fovDeg: number,
  steps = 36,
): Array<{ lat: number; lng: number }> {
  const start = headingDeg - fovDeg / 2
  const end = headingDeg + fovDeg / 2
  const pts: Array<{ lat: number; lng: number }> = []
  pts.push({ lat: centerLat, lng: centerLng })
  for (let i = 0; i <= steps; i += 1) {
    const a = start + ((end - start) * i) / steps
    pts.push(polarToLatLngWeb(centerLat, centerLng, radiusM, a))
  }
  pts.push({ lat: centerLat, lng: centerLng })
  return pts
}

type ScenarioRectBounds = {
  sw: { lat: number; lng: number }
  ne: { lat: number; lng: number }
}

/** 남하 경로 관측 권역(expectedEnemyRouteBounds) 내부 여부 — sw/ne 의도와 무관하게 min/max 로 판정 */
function pointInEnemyRouteCorridor(lat: number, lng: number, b: ScenarioRectBounds): boolean {
  const latMin = Math.min(b.sw.lat, b.ne.lat)
  const latMax = Math.max(b.sw.lat, b.ne.lat)
  const lngMin = Math.min(b.sw.lng, b.ne.lng)
  const lngMax = Math.max(b.sw.lng, b.ne.lng)
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax
}

/**
 * 주 적 궤적에서 관측 권역에 처음 들어가는 시뮬 진행률(0~1).
 * 평양 소실 구역(권역 밖)에서는 미관측, 파란 네모에 진입하는 순간부터 관측 가능.
 */
function findEnemyCorridorEntryProgress(
  path: SimPoint[] | undefined,
  bounds: ScenarioRectBounds,
): number | null {
  if (!path || path.length < 2) return null
  const steps = 2048
  for (let i = 0; i <= steps; i++) {
    const p = i / steps
    const { lat, lng } = samplePath(path, p)
    if (pointInEnemyRouteCorridor(lat, lng, bounds)) return p
  }
  return null
}

/** 남서–북동 바운드 → 시계방향 직사각형 폴리곤(카카오 Polygon.path) */
function buildRectanglePolygonPath(
  kakaoMaps: KakaoMapsApi,
  b: ScenarioRectBounds,
): unknown[] {
  const { sw, ne } = b
  const se = { lat: sw.lat, lng: ne.lng }
  const nw = { lat: ne.lat, lng: sw.lng }
  return [
    new kakaoMaps.LatLng(sw.lat, sw.lng),
    new kakaoMaps.LatLng(se.lat, se.lng),
    new kakaoMaps.LatLng(ne.lat, ne.lng),
    new kakaoMaps.LatLng(nw.lat, nw.lng),
  ]
}

function dopplerMarkerColor(dopplerMps: number): string {
  if (dopplerMps <= -4) return '#1d4ed8'
  if (dopplerMps >= 4) return '#dc2626'
  return '#64748b'
}

type ApplySimFrameOpts = {
  radarSite: RadarSite | null
  primaryEnemyId: number | null
  sarContact: boolean
  /** 초기 SAR/UAV 단계에서는 적 핀 자체를 숨김 */
  enemyVisible?: boolean
  /** false면 적 핀은 유지하고 C2–적 축선·거리 라벨만 숨김 */
  showC2EnemyAxis?: boolean
  /** 예약: 적을 점(단순 블립)으로만 표현 */
  enemyDotOnly?: boolean
  /** C2–적 거리(km) */
  primaryEnemyDistanceKm?: number | null
  /** true일 때만 FMCW 섹터 내 락·탐지 콜백 처리 */
  fmcwRadarActive?: boolean
  /** SAR 접촉 후 C2 기준 ≤15km — 드론 출동·현장 촬영 */
  droneFilmingActive?: boolean
  /** 통합 시뮬(4단계)일 때만 드론 UI·핀 스타일 적용 */
  scenarioIntegratedSimActive?: boolean
  onPrimaryEnemyRadarDetect?: (detected: boolean) => void
  onPrimaryEnemyNearDmz38?: (near: boolean) => void
  /** 전술 선택에 따라 표적 방향으로 전진 배치되는 아군(출전) */
  deployedFriendlyUnitIds?: ReadonlySet<number>
}

function mergeSimFrameOpts(
  base: ApplySimFrameOpts | undefined,
  dist: number | null,
): ApplySimFrameOpts {
  const b =
    base ??
    ({
      radarSite: null,
      primaryEnemyId: null,
      sarContact: false,
      scenarioIntegratedSimActive: false,
    } satisfies ApplySimFrameOpts)
  return {
    radarSite: b.radarSite ?? null,
    primaryEnemyId: b.primaryEnemyId ?? null,
    sarContact: b.sarContact,
    enemyVisible: b.enemyVisible !== false,
    showC2EnemyAxis: b.showC2EnemyAxis !== false,
    enemyDotOnly: b.enemyDotOnly === true,
    scenarioIntegratedSimActive: b.scenarioIntegratedSimActive === true,
    onPrimaryEnemyRadarDetect: b.onPrimaryEnemyRadarDetect,
    onPrimaryEnemyNearDmz38: b.onPrimaryEnemyNearDmz38,
    primaryEnemyDistanceKm: dist,
    fmcwRadarActive: dist != null && dist <= SCENARIO_RANGES_KM.FMCW_MAX,
    droneFilmingActive:
      b.scenarioIntegratedSimActive === true &&
      b.sarContact &&
      dist != null &&
      dist <= SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM,
    deployedFriendlyUnitIds: b.deployedFriendlyUnitIds,
  }
}

function applySimulationFrame(
  scene: MapScene,
  paths: SimPathBundle,
  progress: number,
  opts?: ApplySimFrameOpts,
) {
  const { kakaoMaps, map, units, enemies } = scene
  const {
    c2EnemyLine,
    distanceLabelOverlay,
    distanceLabelEl,
    droneAssetOverlay,
    droneAssetEl,
    c2UnitId,
    primaryEnemyId,
  } = scene

  units.forEach(({ id, pin, info, pinEl }) => {
    const path = paths.friendly.get(id)
    if (!path) return
    const base = samplePath(path, progress)
    let { lat, lng } = base
    const deployed = opts?.deployedFriendlyUnitIds?.has(id) ?? false
    if (
      deployed &&
      opts?.primaryEnemyId != null &&
      progress > 0.01 &&
      opts.enemyVisible !== false
    ) {
      const ePath = paths.enemy.get(opts.primaryEnemyId)
      if (ePath && ePath.length > 1) {
        const tgt = samplePath(ePath, progress)
        const α = 0.26
        lat = base.lat + (tgt.lat - base.lat) * α
        lng = base.lng + (tgt.lng - base.lng) * α
      }
    }
    pinEl.classList.toggle('friendly-pin--tactic-deployed', deployed)
    const ll = new kakaoMaps.LatLng(lat, lng)
    pin.setPosition(ll)
    // setPosition만으로 DOM이 갱신되지 않는 카카오맵 버전 대비: 지도에 다시 붙여 그리기
    pin.setMap(map)
    const infoOpen = info.getMap?.() != null
    info.setPosition(ll)
    if (infoOpen) {
      info.setMap(map)
    }
  })
  enemies.forEach(({ id, pin, info, circle, pinEl }) => {
    const path = paths.enemy.get(id)
    if (!path) return
    const { lat, lng } = samplePath(path, progress)
    const ll = new kakaoMaps.LatLng(lat, lng)
    pin.setPosition(ll)
    const enemyVisible = opts?.enemyVisible !== false
    pin.setMap(enemyVisible ? map : null)
    const infoOpen = info.getMap?.() != null
    info.setPosition(ll)
    if (infoOpen && enemyVisible) {
      info.setMap(map)
    } else if (!enemyVisible) {
      info.setMap(null)
    }
    if (typeof circle.setPosition === 'function') {
      circle.setPosition(ll)
    } else {
      circle.setOptions?.({ center: ll })
    }
    if (!enemyVisible) {
      circle.setMap(null)
      pinEl.classList.remove(
        'enemy-pin--radar-lock',
        'enemy-pin--dmz-near',
        'enemy-pin--drone-filming',
        'enemy-pin--dot-only',
      )
      if (id === opts?.primaryEnemyId && opts?.onPrimaryEnemyRadarDetect) {
        opts.onPrimaryEnemyRadarDetect(false)
      }
      if (id === opts?.primaryEnemyId) {
        opts?.onPrimaryEnemyNearDmz38?.(false)
      }
      return
    }

    const dotOnly = opts?.enemyDotOnly === true
    pinEl.classList.toggle('enemy-pin--dot-only', dotOnly)

    const fmcwActive = opts?.fmcwRadarActive === true
    if (opts?.radarSite && opts.sarContact && fmcwActive) {
      const inCov = isEnemyInRadarCoverage(lat, lng, opts.radarSite)
      const showLock = inCov && progress > 0.02
      pinEl.classList.toggle('enemy-pin--radar-lock', showLock)
      if (id === opts.primaryEnemyId && opts.onPrimaryEnemyRadarDetect) {
        opts.onPrimaryEnemyRadarDetect(showLock)
      }
    } else {
      pinEl.classList.remove('enemy-pin--radar-lock')
      if (id === opts?.primaryEnemyId && opts?.onPrimaryEnemyRadarDetect) {
        opts.onPrimaryEnemyRadarDetect(false)
      }
    }

    if (id === opts?.primaryEnemyId) {
      const nearDmz = progress > 0.01 && isEnemyNearDmz38(lat)
      pinEl.classList.toggle('enemy-pin--dmz-near', nearDmz)
      opts?.onPrimaryEnemyNearDmz38?.(nearDmz)
    } else {
      pinEl.classList.remove('enemy-pin--dmz-near')
    }

    if (id === opts?.primaryEnemyId) {
      if (dotOnly) {
        circle.setMap(null)
      } else {
        circle.setMap(map)
      }
      pinEl.classList.toggle('enemy-pin--drone-filming', opts?.droneFilmingActive === true)
    } else {
      pinEl.classList.remove('enemy-pin--drone-filming')
      pinEl.classList.remove('enemy-pin--dot-only')
    }
  })

  const axisVisible = opts?.enemyVisible !== false && opts?.showC2EnemyAxis !== false
  if (
    c2EnemyLine?.setPath &&
    c2UnitId != null &&
    primaryEnemyId != null &&
    distanceLabelOverlay?.setPosition
  ) {
    const c2Path = paths.friendly.get(c2UnitId)
    const ePath = paths.enemy.get(primaryEnemyId)
    if (c2Path && ePath) {
      const a = samplePath(c2Path, progress)
      const b = samplePath(ePath, progress)
      c2EnemyLine.setPath([
        new kakaoMaps.LatLng(a.lat, a.lng),
        new kakaoMaps.LatLng(b.lat, b.lng),
      ])
      c2EnemyLine.setMap(axisVisible ? map : null)
      const midLat = (a.lat + b.lat) / 2
      const midLng = (a.lng + b.lng) / 2
      distanceLabelOverlay.setPosition(new kakaoMaps.LatLng(midLat, midLng))
      const km = haversineKm(a, b)
      if (distanceLabelEl) {
        distanceLabelEl.textContent = `적–지휘통제실 ${km.toFixed(1)} km`
      }
      distanceLabelOverlay.setMap(axisVisible ? map : null)
    }
  }

  if (droneAssetOverlay?.setPosition && primaryEnemyId != null) {
    const ePath = paths.enemy.get(primaryEnemyId)
    if (ePath) {
      const e = samplePath(ePath, progress)
      const dronePos = polarToLatLngWeb(e.lat, e.lng, 700, 315)
      droneAssetOverlay.setPosition(new kakaoMaps.LatLng(dronePos.lat, dronePos.lng))
      const showDrone = opts?.droneFilmingActive === true && opts?.enemyVisible !== false
      droneAssetOverlay.setMap(showDrone ? map : null)
      droneAssetEl?.classList.toggle('map-drone-asset--active', showDrone)
    } else {
      droneAssetOverlay.setMap(null)
      droneAssetEl?.classList.remove('map-drone-asset--active')
    }
  }
}

type KakaoMapsApi = {
  load: (callback: () => void) => void
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (southWest: unknown, northEast: unknown) => unknown
  Map: new (
    container: HTMLElement,
    options: {
      center: unknown
      level: number
    },
  ) => KakaoMap
  CustomOverlay: new (options: {
    position: unknown
    yAnchor?: number
    xAnchor?: number
    content: HTMLElement
    map?: KakaoMap
    zIndex?: number
  }) => KakaoCustomOverlayInstance
  Circle: new (options: {
    center: unknown
    radius: number
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
    zIndex?: number
  }) => KakaoCircleInstance
  Polygon: new (options: {
    path: unknown[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
    zIndex?: number
  }) => KakaoPolygonInstance
  event: {
    addListener: (target: unknown, type: string, callback: (...args: unknown[]) => void) => void
  }
  Polyline: new (options: {
    path: unknown[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    strokeStyle?: string
    zIndex?: number
  }) => KakaoPolylineInstance
}

type AttachPinsCtx = {
  kakaoMaps: KakaoMapsApi
  map: KakaoMap
  friendlyUnits: FriendlyUnit[]
  enemyInfiltrations: EnemyInfiltration[]
  radarSnapshot: RadarSnapshot | null
  radarSnapshotRef: MutableRefObject<RadarSnapshot | null>
  openMapVideoModalRef: MutableRefObject<(p: MapVideoModalState) => void>
  radarHoverLeaveTimerRef: MutableRefObject<number | null>
  setRadarEnemyHover: (e: EnemyInfiltration | null) => void
  /** 메인 지도에서만 레이더 호버 패널 연동 */
  enableRadarHoverPanel: boolean
  /** SAR 접촉 후 인셋: 지휘통제실·우선 적만(간략 UI) */
  insetMinimal?: boolean
  /** SAR 광역 지도: 아군은 대대(지휘통제실)만 단일 점으로 표시 */
  overviewSarC2Dot?: boolean
  /** 통합 시뮬 지도: AIS형 호버(속도·좌표·표고) + 클릭 시 영상 모달 */
  enableTacticalAisUi?: boolean
  simPathsRef?: MutableRefObject<SimPathBundle | null>
  simProgressRef?: MutableRefObject<number>
  /** 메인 지도: 적 핀 호버 시 표적 재원 플로팅 패널 */
  enemyAssetHoverRef?: MutableRefObject<{
    enter: (enemy: EnemyInfiltration) => void
    leave: () => void
    clear: () => void
  } | null>
}

function attachKakaoTacticalPins(
  ctx: AttachPinsCtx,
): { units: MapScene['units']; enemies: MapScene['enemies'] } {
  const {
    kakaoMaps,
    map,
    friendlyUnits,
    enemyInfiltrations,
    radarSnapshotRef,
    openMapVideoModalRef,
    radarHoverLeaveTimerRef,
    setRadarEnemyHover,
    enableRadarHoverPanel,
    insetMinimal = false,
    overviewSarC2Dot = false,
    enableTacticalAisUi = false,
    simPathsRef: simPathsRefCtx,
    simProgressRef: simProgressRefCtx,
    enemyAssetHoverRef,
  } = ctx

  const tacticalAisUiEnabled =
    enableTacticalAisUi && simPathsRefCtx != null && simProgressRefCtx != null

  const primaryForInset = insetMinimal
    ? pickPrimaryEnemyForDistance(enemyInfiltrations)
    : null
  const friendlySource = overviewSarC2Dot
    ? friendlyUnits.filter(isBattalionC2Unit)
    : insetMinimal
      ? friendlyUnits.filter(isBattalionC2Unit)
      : friendlyUnits
  const enemySource = insetMinimal
    ? primaryForInset
      ? enemyInfiltrations.filter((e) => e.id === primaryForInset.id)
      : []
    : enemyInfiltrations

  const unitScene: MapScene['units'] = []
  const enemyScene: MapScene['enemies'] = []

  friendlySource.forEach((unit) => {
    const position = new kakaoMaps.LatLng(unit.lat, unit.lng)
    const markerColor = UNIT_LEVEL_MARKER_COLOR[unit.level]

    const pinEl = document.createElement('div')
    if (overviewSarC2Dot) {
      pinEl.className = 'sar-overview-c2-anchor'
      pinEl.title = `${unit.name} · 대대 지휘통제실`
      pinEl.innerHTML =
        '<div class="sar-overview-c2-dot" aria-hidden="true"></div><span class="sar-overview-c2-label">C2</span><span class="sar-overview-c2-sublabel">아군 위치</span>'
    } else {
      pinEl.className = 'kakao-tactical-pin-anchor'
      if (isBattalionC2Unit(unit)) {
        pinEl.classList.add('kakao-tactical-pin-anchor--c2')
      }
      pinEl.title = `아군 · ${unit.level} | ${unit.name} · ${TACTICAL_SYMBOL_LABEL[unit.symbolType]}`
      pinEl.innerHTML = buildFriendlyTacticalPinHTML(unit)
    }

    const pinOverlay = new kakaoMaps.CustomOverlay({
      map,
      position,
      yAnchor: overviewSarC2Dot ? 0.5 : 1,
      xAnchor: overviewSarC2Dot ? 0.5 : 0.5,
      content: pinEl,
      zIndex: 3,
    })

    let infoOverlay: KakaoCustomOverlayInstance

    if (tacticalAisUiEnabled) {
      const title = overviewSarC2Dot ? `${unit.name} · C2` : `${unit.level} · ${unit.name}`
      infoOverlay = createLiveKinematicsInfowindow(kakaoMaps, map, position, pinEl, {
        kind: 'friendly',
        title,
        simPathsRef: simPathsRefCtx!,
        simProgressRef: simProgressRefCtx!,
        pathKey: 'friendly',
        entityId: unit.id,
        onSelect: () =>
          openMapVideoModalRef.current({
            title: unit.name,
            subtitle: `아군 · ${unit.level} · ${unit.branch}`,
            videoUrl: unit.situationVideoUrl,
          }),
      })
    } else {
      const infoContent = document.createElement('div')
      infoContent.className =
        overviewSarC2Dot || insetMinimal
          ? 'unit-infowindow unit-infowindow-friendly unit-map-overlay map-hover-side-card map-hover-side-card--friendly map-hover-side-card--minimal'
          : 'unit-infowindow unit-infowindow-friendly unit-map-overlay map-hover-side-card map-hover-side-card--friendly'
      infoContent.innerHTML =
        overviewSarC2Dot || insetMinimal
          ? `
                <span class="unit-badge unit-badge-friendly">C2</span>
                <h4 style="border-left-color:${markerColor};">
                  ${unit.name}
                </h4>
                <p class="map-hover-minimal-line">지휘통제실 · 클릭 시 영상</p>
                <p class="map-hover-minimal-line muted">WGS84 ${formatLatLngReadout(unit.lat, unit.lng)}</p>
                <p class="map-hover-minimal-line muted">MGRS ${latLngToMgrsSafe(unit.lat, unit.lng)}</p>
              `
          : `
                <span class="unit-badge unit-badge-friendly">아군</span>
                <h4 style="border-left-color:${markerColor};">
                  ${unit.level} · ${unit.name}
                </h4>
                <p><strong>전술 부호:</strong> ${TACTICAL_SYMBOL_LABEL[unit.symbolType]}</p>
                <p><strong>위치:</strong> ${LOCATION_STATUS_LABEL[unit.locationStatus]}${STRENGTH_LABEL[unit.strengthModifier] ? ` · ${STRENGTH_LABEL[unit.strengthModifier]}` : ''}</p>
                <p><strong>좌표(WGS84):</strong> ${formatLatLngReadout(unit.lat, unit.lng)}</p>
                <p><strong>MGRS:</strong> ${latLngToMgrsSafe(unit.lat, unit.lng)}</p>
                <p><strong>병과:</strong> ${unit.branch}</p>
                <p><strong>병력:</strong> ${unit.personnel}명</p>
                <p><strong>장비:</strong> ${unit.equipment}</p>
                <p><strong>준비태세:</strong> ${unit.readiness}</p>
                <p><strong>임무:</strong> ${unit.mission}</p>
                <p class="map-hover-video-hint">클릭하면 상황·정찰 영상</p>
              `

      infoOverlay = new kakaoMaps.CustomOverlay({
        position,
        yAnchor: 0.5,
        xAnchor: overviewSarC2Dot ? 0.5 : 0,
        content: infoContent,
        zIndex: 4,
      })
      infoOverlay.setMap(null)

      let infoHideTimer: number | null = null
      const clearInfoHide = () => {
        if (infoHideTimer !== null) {
          window.clearTimeout(infoHideTimer)
          infoHideTimer = null
        }
      }
      const scheduleInfoHide = () => {
        clearInfoHide()
        infoHideTimer = window.setTimeout(() => infoOverlay.setMap(null), 180)
      }

      pinEl.addEventListener('mouseenter', () => {
        clearInfoHide()
        infoOverlay.setMap(map)
      })
      pinEl.addEventListener('mouseleave', scheduleInfoHide)
      infoContent.addEventListener('mouseenter', clearInfoHide)
      infoContent.addEventListener('mouseleave', scheduleInfoHide)
      pinEl.addEventListener('click', (ev) => {
        ev.stopPropagation()
        clearInfoHide()
        infoOverlay.setMap(null)
        openMapVideoModalRef.current({
          title: unit.name,
          subtitle: `아군 · ${unit.level} · ${unit.branch}`,
          videoUrl: unit.situationVideoUrl,
        })
      })
    }

    unitScene.push({ id: unit.id, pin: pinOverlay, info: infoOverlay, pinEl })
  })

  enemySource.forEach((enemy) => {
    const position = new kakaoMaps.LatLng(enemy.lat, enemy.lng)

    const circle = new kakaoMaps.Circle({
      center: position,
      radius: enemy.riskRadiusMeter,
      strokeWeight: 1,
      strokeColor: THREAT_COLOR[enemy.threatLevel],
      strokeOpacity: 0.38,
      fillColor: THREAT_COLOR[enemy.threatLevel],
      fillOpacity: 0.07,
      zIndex: 2,
    })
    circle.setMap(map)

    const pinEl = document.createElement('div')
    pinEl.className = 'kakao-tactical-pin-anchor'
    pinEl.title = `적군 · ${enemy.codename} · ${enemy.enemyBranch}`
    pinEl.innerHTML = buildEnemyTacticalPinHTML(enemy)

    const pinOverlay = new kakaoMaps.CustomOverlay({
      map,
      position,
      yAnchor: 1,
      xAnchor: 0.5,
      content: pinEl,
      zIndex: 3,
    })

    let infoOverlay: KakaoCustomOverlayInstance

    if (tacticalAisUiEnabled) {
      infoOverlay = createLiveKinematicsInfowindow(kakaoMaps, map, position, pinEl, {
        kind: 'enemy',
        title: enemy.codename,
        simPathsRef: simPathsRefCtx!,
        simProgressRef: simProgressRefCtx!,
        pathKey: 'enemy',
        entityId: enemy.id,
        onSelect: () => {
          setRadarEnemyHover(null)
          enemyAssetHoverRef?.current?.clear()
          openMapVideoModalRef.current(enemyIntelVideoModalState(enemy))
        },
        onPinMouseEnterExtra: () => {
          enemyAssetHoverRef?.current?.enter(enemy)
          const snap = radarSnapshotRef.current
          const locked =
            enableRadarHoverPanel &&
            snap != null &&
            pinEl.classList.contains('enemy-pin--radar-lock')
          if (locked) {
            if (radarHoverLeaveTimerRef.current != null) {
              window.clearTimeout(radarHoverLeaveTimerRef.current)
              radarHoverLeaveTimerRef.current = null
            }
            setRadarEnemyHover(enemy)
          }
        },
        onPinMouseLeaveExtra: () => {
          enemyAssetHoverRef?.current?.leave()
          if (enableRadarHoverPanel && pinEl.classList.contains('enemy-pin--radar-lock')) {
            radarHoverLeaveTimerRef.current = window.setTimeout(() => {
              setRadarEnemyHover(null)
              radarHoverLeaveTimerRef.current = null
            }, 320)
          }
        },
      })
    } else {
      const infoContent = document.createElement('div')
      infoContent.className = insetMinimal
        ? 'unit-map-overlay enemy-infowindow map-hover-side-card map-hover-side-card--enemy map-hover-side-card--minimal'
        : 'unit-map-overlay enemy-infowindow map-hover-side-card map-hover-side-card--enemy'
      infoContent.innerHTML = insetMinimal
        ? `
            <span class="enemy-badge">적</span>
            <h4 class="enemy-infowindow-title" style="border-left-color:${THREAT_COLOR[enemy.threatLevel]};">
              ${enemy.codename}
            </h4>
            <p class="map-hover-minimal-line">우선 표적 · 클릭 시 집결 영상·드론</p>
            <p class="map-hover-minimal-line muted">WGS84 ${formatLatLngReadout(enemy.lat, enemy.lng)}</p>
            <p class="map-hover-minimal-line muted">MGRS ${latLngToMgrsSafe(enemy.lat, enemy.lng)}</p>
          `
        : `
            <span class="enemy-badge">적군</span>
            <h4 class="enemy-infowindow-title" style="border-left-color:${THREAT_COLOR[enemy.threatLevel]};">
              ${enemy.codename}
            </h4>
            <p><strong>병과:</strong> ${enemy.enemyBranch}</p>
            <p><strong>위협:</strong> ${enemy.threatLevel}</p>
            <p><strong>추정 인원:</strong> ${enemy.estimatedCount}명</p>
            <p><strong>관측 시각:</strong> ${enemy.observedAt}</p>
            <p><strong>위험 반경:</strong> ${enemy.riskRadiusMeter.toLocaleString('ko-KR')}m</p>
            <p><strong>좌표(WGS84):</strong> ${formatLatLngReadout(enemy.lat, enemy.lng)}</p>
            <p><strong>MGRS:</strong> ${latLngToMgrsSafe(enemy.lat, enemy.lng)}</p>
            <p class="map-hover-video-hint">클릭: 전차 집결 영상 · 드론 출동</p>
          `

      infoOverlay = new kakaoMaps.CustomOverlay({
        position,
        yAnchor: 0.5,
        xAnchor: 0,
        content: infoContent,
        zIndex: 4,
      })
      infoOverlay.setMap(null)

      let infoHideTimer: number | null = null
      const clearEnemyInfoHide = () => {
        if (infoHideTimer !== null) {
          window.clearTimeout(infoHideTimer)
          infoHideTimer = null
        }
      }
      const scheduleEnemyInfoHide = () => {
        clearEnemyInfoHide()
        infoHideTimer = window.setTimeout(() => infoOverlay.setMap(null), 180)
      }

      pinEl.addEventListener('mouseenter', () => {
        clearEnemyInfoHide()
        infoOverlay.setMap(map)
        const snap = radarSnapshotRef.current
        const locked =
          enableRadarHoverPanel &&
          snap != null &&
          pinEl.classList.contains('enemy-pin--radar-lock')
        if (locked) {
          if (radarHoverLeaveTimerRef.current != null) {
            window.clearTimeout(radarHoverLeaveTimerRef.current)
            radarHoverLeaveTimerRef.current = null
          }
          setRadarEnemyHover(enemy)
        }
      })
      pinEl.addEventListener('mouseleave', () => {
        scheduleEnemyInfoHide()
        if (enableRadarHoverPanel && pinEl.classList.contains('enemy-pin--radar-lock')) {
          radarHoverLeaveTimerRef.current = window.setTimeout(() => {
            setRadarEnemyHover(null)
            radarHoverLeaveTimerRef.current = null
          }, 320)
        }
      })
      infoContent.addEventListener('mouseenter', clearEnemyInfoHide)
      infoContent.addEventListener('mouseleave', scheduleEnemyInfoHide)
      pinEl.addEventListener('click', (ev) => {
        ev.stopPropagation()
        clearEnemyInfoHide()
        infoOverlay.setMap(null)
        setRadarEnemyHover(null)
        openMapVideoModalRef.current(enemyIntelVideoModalState(enemy))
      })
    }

    enemyScene.push({
      id: enemy.id,
      pin: pinOverlay,
      info: infoOverlay,
      circle,
      pinEl,
    })
  })

  return { units: unitScene, enemies: enemyScene }
}

function HomePage({ user }: HomePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const scenarioStep = useMemo((): 0 | 1 | 2 | 3 | 4 | 5 => {
    const q = searchParams.get('scenario')
    const n = q != null && q !== '' ? parseInt(q, 10) : NaN
    if (!Number.isFinite(n) || n < 1) return 0
    if (n > 5) return 5
    return n as 0 | 1 | 2 | 3 | 4 | 5
  }, [searchParams])
  const setScenarioStep = useCallback(
    (step: 0 | 1 | 2 | 3 | 4 | 5) => {
      if (step === 0) setSearchParams({}, { replace: true })
      else setSearchParams({ scenario: String(step) }, { replace: true })
    },
    [setSearchParams],
  )

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const insetMapContainerRef = useRef<HTMLDivElement | null>(null)
  const simKakaoMapsRef = useRef<{ main: KakaoMap | null; inset: KakaoMap | null }>({
    main: null,
    inset: null,
  })
  const sceneRef = useRef<MapScene | null>(null)
  const insetSceneRef = useRef<MapScene | null>(null)
  const simProgressRef = useRef(0)
  const [friendlyUnits, setFriendlyUnits] = useState<FriendlyUnit[]>([])
  const [enemyInfiltrations, setEnemyInfiltrations] = useState<EnemyInfiltration[]>([])
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
  const [simMapZoomRevision, setSimMapZoomRevision] = useState(0)
  const [simPlaying, setSimPlaying] = useState(false)
  const [simProgress, setSimProgress] = useState(0)
  /** 4단계 진입 직후 ~SIM_INTRO_POSITIONS_MS: 궤적 재생·타임라인 비활성, 초기 배치만 표시 */
  const [simIntroActive, setSimIntroActive] = useState(false)
  /** 인트로 직후: 위성 SAR 신호 손실·적 소실 경고 배너 */
  const [simSarLossAlertVisible, setSimSarLossAlertVisible] = useState(false)
  const simIntroActiveRef = useRef(false)
  const prevScenarioStepForIntroRef = useRef<0 | 1 | 2 | 3 | 4 | 5 | null>(null)
  const prevSimIntroForLossAlertRef = useRef(false)
  useEffect(() => {
    simIntroActiveRef.current = simIntroActive
  }, [simIntroActive])
  const [simSeekDragging, setSimSeekDragging] = useState(false)
  const simSeekTrackRef = useRef<HTMLDivElement | null>(null)
  const [simSpeed, setSimSpeed] = useState<0.5 | 1 | 2>(1)
  const [simPaths, setSimPaths] = useState<SimPathBundle | null>(null)
  const [roadPathStatus, setRoadPathStatus] = useState<
    'idle' | 'loading' | 'all-road' | 'partial' | 'synthetic'
  >('idle')
  const simPathsRef = useRef<SimPathBundle | null>(null)
  const [mapVideoModal, setMapVideoModal] = useState<MapVideoModalState | null>(null)
  const openMapVideoModalRef = useRef<(p: MapVideoModalState) => void>(() => {})
  openMapVideoModalRef.current = (p) => setMapVideoModal(p)
  const [radarSnapshot, setRadarSnapshot] = useState<RadarSnapshot | null>(null)
  /** SAR로 적 표적 확정 후 true — UAV·전술 지도 공통 */
  const [sarContact, setSarContact] = useState(false)
  /** 통합 시뮬(4) 내부만: 3=전술 권역 밖, 4=40km 이내, 5=FMCW(≤15km) — 거리로 자동 전환 */
  const [tacticalSubStep, setTacticalSubStep] = useState<3 | 4 | 5>(3)
  /** 통합 시뮬 내 서브단계(3~5) 표현 — 카카오 지도·카드·SVG·Canvas·나란히 */
  const [tacticalPhaseUi, setTacticalPhaseUi] = useState<
    'map' | 'dashboard' | 'schematic' | 'canvasScope' | 'compare'
  >('map')
  /** 나란히 비교 시 오른쪽 패널 */
  const [compareRightPane, setCompareRightPane] = useState<
    'dashboard' | 'schematic' | 'canvasScope'
  >('schematic')
  const [radarEnemyHover, setRadarEnemyHover] = useState<EnemyInfiltration | null>(null)
  const radarHoverLeaveTimerRef = useRef<number | null>(null)
  const [mapEnemyAssetHover, setMapEnemyAssetHover] = useState<EnemyInfiltration | null>(null)
  const enemyAssetFloatLeaveTimerRef = useRef<number | null>(null)
  const clearEnemyAssetFloatTimer = useCallback(() => {
    if (enemyAssetFloatLeaveTimerRef.current != null) {
      window.clearTimeout(enemyAssetFloatLeaveTimerRef.current)
      enemyAssetFloatLeaveTimerRef.current = null
    }
  }, [])
  const scheduleEnemyAssetFloatHide = useCallback(() => {
    clearEnemyAssetFloatTimer()
    enemyAssetFloatLeaveTimerRef.current = window.setTimeout(() => {
      setMapEnemyAssetHover(null)
      enemyAssetFloatLeaveTimerRef.current = null
    }, 520)
  }, [clearEnemyAssetFloatTimer])
  const enemyAssetHoverRef = useRef<{
    enter: (enemy: EnemyInfiltration) => void
    leave: () => void
    clear: () => void
  } | null>(null)
  const [mapCursorLatLng, setMapCursorLatLng] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const mapCursorSetterRef = useRef<(p: { lat: number; lng: number } | null) => void>(() => {})
  mapCursorSetterRef.current = (p) => setMapCursorLatLng(p)
  const [uavLaunchStartProgress, setUavLaunchStartProgress] = useState<number | null>(null)
  const [uavOrderModalOpen, setUavOrderModalOpen] = useState(false)
  const [uavMissionProfile, setUavMissionProfile] = useState<UavMissionProfileId>('sar_eo_balanced')
  const [uavOrderedProfile, setUavOrderedProfile] = useState<UavMissionProfileId | null>(null)
  const [droneLaunchStartProgress, setDroneLaunchStartProgress] = useState<number | null>(null)
  const [uavEnemyVideoExpanded, setUavEnemyVideoExpanded] = useState(false)
  const [tacticRecommendations, setTacticRecommendations] = useState<TacticRecommendation[]>([])
  const [tacticLoading, setTacticLoading] = useState(false)
  const [tacticSavePending, setTacticSavePending] = useState(false)
  const [tacticSaveMessage, setTacticSaveMessage] = useState<string | null>(null)
  const [selectedTacticUnit, setSelectedTacticUnit] = useState<string | null>(null)
  const [tacticDeployedUnitIds, setTacticDeployedUnitIds] = useState<number[]>([])
  const [tacticDecisionNote, setTacticDecisionNote] = useState('')
  const [tacticSupportPopoverOpen, setTacticSupportPopoverOpen] = useState(false)
  const uavOrderModalTitleId = useId()
  const tacticPopoverTitleId = useId()
  const bestTacticRecommendation = useMemo(() => {
    if (tacticRecommendations.length === 0) return null
    return [...tacticRecommendations].sort((a, b) => b.suitabilityPct - a.suitabilityPct)[0] ?? null
  }, [tacticRecommendations])

  const c2UnitForSim = useMemo(
    () => friendlyUnits.find(isBattalionC2Unit) ?? null,
    [friendlyUnits],
  )
  const primaryEnemyForSim = useMemo(
    () => pickPrimaryEnemyForDistance(enemyInfiltrations),
    [enemyInfiltrations],
  )

  const enemyCorridorEntryProgress = useMemo(() => {
    if (!simPaths || !primaryEnemyForSim) return SAR_ENEMY_BLIP_PROGRESS
    const path = simPaths.enemy.get(primaryEnemyForSim.id)
    const p = findEnemyCorridorEntryProgress(path, BATTALION_SCENARIO.expectedEnemyRouteBounds)
    return p ?? SAR_ENEMY_BLIP_PROGRESS
  }, [simPaths, primaryEnemyForSim?.id])

  /** 관측 권역(파란 네모) 진입 후 짧은 구간 블립 표시 → 일시정지(UAV 승인). 진입이 늦으면 일시정지도 뒤로 밀림 */
  const wideScanPauseProgress = useMemo(
    () =>
      Math.min(0.95, Math.max(SAR_WIDE_SCAN_PAUSE_PROGRESS, enemyCorridorEntryProgress + 0.03)),
    [enemyCorridorEntryProgress],
  )

  const enemyDistanceKm = useMemo(() => {
    if (scenarioStep !== 5 || !simPaths) return null
    if (simProgress < enemyCorridorEntryProgress) return null
    return enemyDistanceFromC2Km(
      simPaths,
      simProgress,
      c2UnitForSim?.id ?? null,
      primaryEnemyForSim?.id ?? null,
    )
  }, [
    scenarioStep,
    simPaths,
    simProgress,
    enemyCorridorEntryProgress,
    c2UnitForSim?.id,
    primaryEnemyForSim?.id,
  ])

  const uavTransitRatio = useMemo(() => {
    if (uavLaunchStartProgress == null) return 0
    return Math.min(1, Math.max(0, (simProgress - uavLaunchStartProgress) / UAV_TRANSIT_PROGRESS_SPAN))
  }, [uavLaunchStartProgress, simProgress])

  const droneTransitRatio = useMemo(() => {
    if (droneLaunchStartProgress == null) return 0
    return Math.min(1, Math.max(0, (simProgress - droneLaunchStartProgress) / DRONE_TRANSIT_PROGRESS_SPAN))
  }, [droneLaunchStartProgress, simProgress])

  const narrativeEnemyDistanceKm = useMemo(() => {
    const startKm = 320
    const endKm = 8
    return Math.max(endKm, startKm - (startKm - endKm) * simProgress)
  }, [simProgress])

  const scenarioV2Phase = useMemo<ScenarioV2Phase>(() => {
    if (scenarioStep !== 5) return 'sat-watch'
    if (uavLaunchStartProgress == null) {
      return simProgress >= wideScanPauseProgress ? 'sat-wide-pause' : 'sat-watch'
    }
    if (uavTransitRatio < 1) return 'uav-transit'
    if (enemyDistanceKm == null || enemyDistanceKm > SCENARIO_RANGES_KM.TACTICAL_RANGE_KM) {
      return 'uav-track-only'
    }
    if (enemyDistanceKm > SCENARIO_RANGES_KM.FMCW_MAX) return 'tactical-mid'
    if (droneTransitRatio < 1) return 'fmcw-drone-transit'
    return 'tactics'
  }, [
    scenarioStep,
    uavLaunchStartProgress,
    uavTransitRatio,
    enemyDistanceKm,
    droneTransitRatio,
    simProgress,
    wideScanPauseProgress,
  ])

  /** 전술 선택이 API 추천 1위(최고 적합도)와 일치할 때 — 표적 제압 가정으로 지도·통합 뷰에서 적 핀 숨김 */
  const enemySuppressedByBestTactic = useMemo(() => {
    if (scenarioStep !== 5 || scenarioV2Phase !== 'tactics') return false
    if (!selectedTacticUnit || !bestTacticRecommendation) return false
    return selectedTacticUnit === bestTacticRecommendation.unitName
  }, [scenarioStep, scenarioV2Phase, selectedTacticUnit, bestTacticRecommendation])

  const tacticalEnemyDisplay = enemySuppressedByBestTactic ? null : primaryEnemyForSim ?? null
  const tacticalEnemyDistanceKm = enemySuppressedByBestTactic ? null : enemyDistanceKm

  const tacticDeployedUnitLabels = useMemo(() => {
    if (tacticDeployedUnitIds.length === 0) return []
    const idSet = new Set(tacticDeployedUnitIds)
    return friendlyUnits.filter((u) => idSet.has(u.id)).map((u) => u.name)
  }, [tacticDeployedUnitIds, friendlyUnits])

  const simIntroPositionsPhase = scenarioStep === 5 && simIntroActive

  const enemyFullPinOnMap =
    scenarioStep !== 5 ||
    scenarioV2Phase === 'tactical-mid' ||
    scenarioV2Phase === 'fmcw-drone-transit' ||
    scenarioV2Phase === 'tactics'

  /** SAR 남하 권역에서 궤적 포착 후 ~ UAV 승인·이동·광역 추적까지는 소형 블립만 */
  const enemySarTrackVisible =
    scenarioStep === 5 &&
    simProgress >= enemyCorridorEntryProgress &&
    (uavLaunchStartProgress != null ||
      scenarioV2Phase === 'sat-watch' ||
      scenarioV2Phase === 'sat-wide-pause')

  const enemyMapVisible =
    !enemySuppressedByBestTactic &&
    (scenarioStep !== 5 ||
      simIntroPositionsPhase ||
      enemyFullPinOnMap ||
      enemySarTrackVisible)

  const enemyDotOnlyOnMap =
    scenarioStep === 5 &&
    !simIntroPositionsPhase &&
    enemySarTrackVisible &&
    !enemyFullPinOnMap

  enemyAssetHoverRef.current = {
    enter: (enemy) => {
      if (!enemyMapVisible) return
      clearEnemyAssetFloatTimer()
      setMapEnemyAssetHover(enemy)
    },
    leave: () => {
      scheduleEnemyAssetFloatHide()
    },
    clear: () => {
      clearEnemyAssetFloatTimer()
      setMapEnemyAssetHover(null)
    },
  }

  const mapEnemyHoverKinematics = useMemo(() => {
    if (!mapEnemyAssetHover || !simPaths) return null
    const path = simPaths.enemy.get(mapEnemyAssetHover.id)
    if (!path?.length) return null
    const { lat, lng } = samplePath(path, simProgress)
    const spd = speedAlongPathKmH(path, simProgress)
    const elev = syntheticElevationM(lat, lng, mapEnemyAssetHover.id * 997 + 13)
    const brg = movementBearingAlongPath(path, simProgress)
    return { lat, lng, spd, elev, brg }
  }, [mapEnemyAssetHover, simPaths, simProgress])

  /** 지휘통제실 기준 40km 이내일 때만 전술 지도 PiP + 인셋 확대(레이더 API와 무관) */
  const showTacticalPip =
    scenarioStep === 5 &&
    tacticalSubStep >= 4 &&
    sarContact &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.TACTICAL_RANGE_KM

  const fmcwInRange =
    scenarioStep === 5 &&
    tacticalSubStep >= 5 &&
    sarContact &&
    radarSnapshot != null &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.FMCW_MAX

  /** C2 기준 ≤15km + SAR 접촉 — 정찰 드론 출동·EO/IR 촬영·전송 */
  const droneDispatchActive =
    scenarioStep === 5 &&
    sarContact &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM

  /** FMCW: ≤15km 부채꼴·상세 탐지·예측 경로 */
  const radarFmcwForMap = fmcwInRange ? radarSnapshot : null

  const insetMinimal =
    sarContact &&
    scenarioStep === 5 &&
    tacticalSubStep >= 4 &&
    enemyDistanceKm != null &&
    enemyDistanceKm > SCENARIO_RANGES_KM.FMCW_MAX &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.TACTICAL_RANGE_KM

  const mapUiActive =
    scenarioStep === 5 && (tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare')

  useEffect(() => {
    if (!mapUiActive) {
      mapCursorSetterRef.current(null)
      clearEnemyAssetFloatTimer()
      setMapEnemyAssetHover(null)
    }
  }, [mapUiActive, clearEnemyAssetFloatTimer])

  const bumpSimMapZoomUi = useCallback(() => setSimMapZoomRevision((r) => r + 1), [])

  const simMainMapZoomIn = useCallback(() => {
    const m = simKakaoMapsRef.current.main
    if (!m) return
    const L = m.getLevel()
    if (L <= KAKAO_MAP_LEVEL_MIN) return
    m.setLevel(L - 1)
    bumpSimMapZoomUi()
  }, [bumpSimMapZoomUi])

  const simMainMapZoomOut = useCallback(() => {
    const m = simKakaoMapsRef.current.main
    if (!m) return
    const L = m.getLevel()
    if (L >= KAKAO_MAP_LEVEL_MAX) return
    m.setLevel(L + 1)
    bumpSimMapZoomUi()
  }, [bumpSimMapZoomUi])

  const simMainMapFitBounds = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return
    const { kakaoMaps, map } = scene
    const ob = BATTALION_SCENARIO.overviewBounds
    const sw = new kakaoMaps.LatLng(ob.sw.lat, ob.sw.lng)
    const ne = new kakaoMaps.LatLng(ob.ne.lat, ob.ne.lng)
    map.setBounds(new kakaoMaps.LatLngBounds(sw, ne), 28, 28, 28, 28)
    bumpSimMapZoomUi()
  }, [bumpSimMapZoomUi])

  const simInsetMapZoomIn = useCallback(() => {
    const m = simKakaoMapsRef.current.inset
    if (!m) return
    const L = m.getLevel()
    if (L <= KAKAO_MAP_LEVEL_MIN) return
    m.setLevel(L - 1)
    bumpSimMapZoomUi()
  }, [bumpSimMapZoomUi])

  const simInsetMapZoomOut = useCallback(() => {
    const m = simKakaoMapsRef.current.inset
    if (!m) return
    const L = m.getLevel()
    if (L >= KAKAO_MAP_LEVEL_MAX) return
    m.setLevel(L + 1)
    bumpSimMapZoomUi()
  }, [bumpSimMapZoomUi])

  const simMainZoomEnabled = useMemo(() => {
    void simMapZoomRevision
    const m = simKakaoMapsRef.current.main
    if (!m) return { zoomIn: false, zoomOut: false }
    const L = m.getLevel()
    return {
      zoomIn: L > KAKAO_MAP_LEVEL_MIN,
      zoomOut: L < KAKAO_MAP_LEVEL_MAX,
    }
  }, [simMapZoomRevision, mapUiActive])

  const simInsetZoomEnabled = useMemo(() => {
    void simMapZoomRevision
    const m = simKakaoMapsRef.current.inset
    if (!m) return { zoomIn: false, zoomOut: false }
    const L = m.getLevel()
    return {
      zoomIn: L > KAKAO_MAP_LEVEL_MIN,
      zoomOut: L < KAKAO_MAP_LEVEL_MAX,
    }
  }, [simMapZoomRevision, mapUiActive, showTacticalPip])

  useEffect(() => {
    if (!enemyMapVisible) {
      clearEnemyAssetFloatTimer()
      setMapEnemyAssetHover(null)
    }
  }, [enemyMapVisible, clearEnemyAssetFloatTimer])

  useEffect(() => {
    if (scenarioStep !== 5) {
      setUavEnemyVideoExpanded(false)
      return
    }
    // 재구성 시나리오에서는 SAR 접촉을 기본 전제로 두고 센서 단계를 진행.
    if (!sarContact) setSarContact(true)
  }, [scenarioStep, sarContact])

  useEffect(() => {
    if (scenarioStep !== 5 || !simPaths) return
    if (uavLaunchStartProgress != null) return
    // 최초 진입 시 자동 재생하지 않고, 사용자가 버튼을 눌렀을 때만 진행.
    if (simProgress >= wideScanPauseProgress && simPlaying) {
      setSimPlaying(false)
    }
  }, [scenarioStep, simPaths, uavLaunchStartProgress, simProgress, simPlaying, wideScanPauseProgress])

  useEffect(() => {
    if (scenarioStep !== 5) return
    if (uavLaunchStartProgress == null) return
    if (enemyDistanceKm == null || enemyDistanceKm > SCENARIO_RANGES_KM.FMCW_MAX) return
    if (droneLaunchStartProgress == null) {
      setDroneLaunchStartProgress(simProgress)
    }
  }, [
    scenarioStep,
    uavLaunchStartProgress,
    enemyDistanceKm,
    droneLaunchStartProgress,
    simProgress,
  ])

  useEffect(() => {
    if (scenarioStep !== 5) {
      setUavLaunchStartProgress(null)
      setDroneLaunchStartProgress(null)
      setUavEnemyVideoExpanded(false)
      setTacticSaveMessage(null)
      setSelectedTacticUnit(null)
      setTacticDecisionNote('')
      setTacticRecommendations([])
      setTacticDeployedUnitIds([])
      return
    }
    setTacticLoading(true)
    void requestJson<{ scenarioKey: string; recommendations: TacticRecommendation[] }>(
      `${getApiBaseUrl()}/map/tactics/recommendations?scenarioKey=battalion-reconstructed-v1`,
    )
      .then((res) => {
        setTacticRecommendations(res.recommendations ?? [])
      })
      .catch(() => {
        setTacticRecommendations([])
      })
      .finally(() => setTacticLoading(false))
  }, [scenarioStep])

  useEffect(() => {
    if (scenarioStep !== 5 || scenarioV2Phase !== 'tactics') {
      setTacticDeployedUnitIds([])
      return
    }
    if (!selectedTacticUnit) {
      setTacticDeployedUnitIds([])
      return
    }
    const rec = tacticRecommendations.find((r) => r.unitName === selectedTacticUnit)
    if (!rec) {
      setTacticDeployedUnitIds([])
      return
    }
    setTacticDeployedUnitIds(
      resolveTacticDeployUnitIds(rec.unitName, rec.payload, friendlyUnits),
    )
  }, [
    scenarioStep,
    scenarioV2Phase,
    selectedTacticUnit,
    tacticRecommendations,
    friendlyUnits,
  ])

  const radarSnapshotRef = useRef<RadarSnapshot | null>(null)
  radarSnapshotRef.current = radarSnapshot

  const radarDiscoveryAnnouncedRef = useRef(false)
  const [enemyRadarDiscovered, setEnemyRadarDiscovered] = useState(false)
  const [enemyNearDmz38, setEnemyNearDmz38] = useState(false)
  const enemyNearDmzPrevRef = useRef(false)

  useEffect(() => {
    const prev = prevScenarioStepForIntroRef.current
    prevScenarioStepForIntroRef.current = scenarioStep

    if (scenarioStep !== 5) {
      setSimIntroActive(false)
      return
    }

    if (prev !== 5) {
      simProgressRef.current = 0
      setSimProgress(0)
      setSimPlaying(false)
      radarDiscoveryAnnouncedRef.current = false
      setEnemyRadarDiscovered(false)
      enemyNearDmzPrevRef.current = false
      setEnemyNearDmz38(false)
      setUavLaunchStartProgress(null)
      setDroneLaunchStartProgress(null)
      setUavOrderedProfile(null)
      setUavOrderModalOpen(false)
      setTacticalSubStep(3)
      setSelectedTacticUnit(null)
      setTacticDeployedUnitIds([])
      setTacticSaveMessage(null)
      setSimSarLossAlertVisible(false)
      setSimIntroActive(true)
    }
  }, [scenarioStep])

  useEffect(() => {
    if (scenarioStep !== 5) {
      setSimSarLossAlertVisible(false)
      prevSimIntroForLossAlertRef.current = false
      return
    }
    const wasIntro = prevSimIntroForLossAlertRef.current
    prevSimIntroForLossAlertRef.current = simIntroActive
    if (wasIntro && !simIntroActive) {
      setSimSarLossAlertVisible(true)
    }
  }, [scenarioStep, simIntroActive])

  useEffect(() => {
    if (!simSarLossAlertVisible || scenarioStep !== 5) return
    const tid = window.setTimeout(() => {
      setSimSarLossAlertVisible(false)
    }, SIM_SAR_LOSS_ALERT_AUTO_DISMISS_MS)
    return () => window.clearTimeout(tid)
  }, [simSarLossAlertVisible, scenarioStep])

  useEffect(() => {
    if (scenarioStep !== 5 || !simIntroActive) return
    const tid = window.setTimeout(() => {
      setSimIntroActive(false)
    }, SIM_INTRO_POSITIONS_MS)
    return () => window.clearTimeout(tid)
  }, [scenarioStep, simIntroActive])

  const simFrameOptsRef = useRef<ApplySimFrameOpts | undefined>(undefined)
  simFrameOptsRef.current = {
    radarSite: (radarSnapshot?.fmcw.radar as RadarSite) ?? null,
    primaryEnemyId: primaryEnemyForSim?.id ?? null,
    sarContact,
    enemyVisible: enemyMapVisible,
    showC2EnemyAxis: scenarioStep !== 5 || !simIntroActive,
    enemyDotOnly: enemyDotOnlyOnMap,
    scenarioIntegratedSimActive: scenarioStep === 5,
    onPrimaryEnemyRadarDetect: (detected) => {
      if (detected && !radarDiscoveryAnnouncedRef.current) {
        radarDiscoveryAnnouncedRef.current = true
        setEnemyRadarDiscovered(true)
      }
    },
    onPrimaryEnemyNearDmz38: (near) => {
      if (enemyNearDmzPrevRef.current !== near) {
        enemyNearDmzPrevRef.current = near
        setEnemyNearDmz38(near)
      }
    },
    deployedFriendlyUnitIds: new Set(tacticDeployedUnitIds),
  }

  useEffect(() => {
    if (scenarioStep !== 5 || enemyDistanceKm == null) return
    if (tacticalSubStep === 3 && enemyDistanceKm <= SCENARIO_RANGES_KM.TACTICAL_RANGE_KM) {
      setTacticalSubStep(4)
    } else if (tacticalSubStep === 4 && enemyDistanceKm <= SCENARIO_RANGES_KM.FMCW_MAX) {
      setTacticalSubStep(5)
    }
  }, [scenarioStep, tacticalSubStep, enemyDistanceKm])

  const clearRadarHoverTimer = useCallback(() => {
    if (radarHoverLeaveTimerRef.current != null) {
      window.clearTimeout(radarHoverLeaveTimerRef.current)
      radarHoverLeaveTimerRef.current = null
    }
  }, [])

  const scheduleRadarHoverClear = useCallback(() => {
    clearRadarHoverTimer()
    radarHoverLeaveTimerRef.current = window.setTimeout(() => {
      setRadarEnemyHover(null)
      radarHoverLeaveTimerRef.current = null
    }, 320)
  }, [clearRadarHoverTimer])

  const radarHoverMetrics = useMemo(() => {
    if (!radarEnemyHover || !radarSnapshot) return null
    const radar = radarSnapshot.fmcw.radar as RadarSite
    return computeRadarTargetMetrics(
      radarEnemyHover.lat,
      radarEnemyHover.lng,
      radar,
      radarEnemyHover.id,
    )
  }, [radarEnemyHover, radarSnapshot])

  const tacticalDashboardRadarCharts = useMemo(() => {
    if (!radarSnapshot?.fmcw.detections.length) return null
    const f = radarSnapshot.fmcw
    return {
      headingDeg: f.radar.headingDeg,
      fovDeg: f.radar.fovDeg,
      rangeMaxM: f.radar.rangeMaxM,
      detections: f.detections,
      track: f.track
        ? { bearingDeg: f.track.bearingDeg, phaseRefDeg: f.track.phaseRefDeg }
        : null,
    }
  }, [radarSnapshot])

  const primaryEnemyPathPoints = useMemo(() => {
    if (!simPaths || !primaryEnemyForSim) return null
    return simPaths.enemy.get(primaryEnemyForSim.id) ?? null
  }, [simPaths, primaryEnemyForSim?.id])

  const enemyMovementBearingDeg = useMemo(() => {
    if (!primaryEnemyPathPoints || primaryEnemyPathPoints.length < 2) return null
    return movementBearingAlongPath(primaryEnemyPathPoints, simProgress)
  }, [primaryEnemyPathPoints, simProgress])

  const schematicBounds = useMemo(() => {
    if (!c2UnitForSim || !primaryEnemyPathPoints?.length) return null
    return computeSchematicBounds(
      { lat: c2UnitForSim.lat, lng: c2UnitForSim.lng },
      primaryEnemyPathPoints,
    )
  }, [c2UnitForSim, primaryEnemyPathPoints])

  const tacticalSimPoints = useMemo(() => {
    if (!simPaths || !c2UnitForSim || !primaryEnemyForSim) return null
    const c2Path = simPaths.friendly.get(c2UnitForSim.id)
    const ePath = simPaths.enemy.get(primaryEnemyForSim.id)
    if (!c2Path || !ePath) return null
    const c2 = samplePath(c2Path, simProgress)
    const enemy = samplePath(ePath, simProgress)
    return {
      c2,
      enemy,
      bearing: bearingDeg(c2.lat, c2.lng, enemy.lat, enemy.lng),
    }
  }, [simPaths, simProgress, c2UnitForSim?.id, primaryEnemyForSim?.id])

  const tacticalSimPointsRef = useRef(tacticalSimPoints)
  tacticalSimPointsRef.current = tacticalSimPoints

  /** PiP 확대 뷰가 시뮬 진행에 따라 너무 자주 setBounds 하지 않도록 양자화 */
  const pipZoomTick = useMemo(
    () => (tacticalSimPoints ? Math.round(simProgress * 40) / 40 : 0),
    [tacticalSimPoints, simProgress],
  )

  const radarCanvasConfig = useMemo(() => {
    if (!radarSnapshot) {
      return { headingDeg: 35, fovDeg: 80, maxRangeKm: 48 }
    }
    const r = radarSnapshot.fmcw.radar
    return {
      headingDeg: r.headingDeg,
      fovDeg: r.fovDeg,
      maxRangeKm: Math.max(48, Math.ceil(r.rangeMaxM / 1000)),
    }
  }, [radarSnapshot])

  const noMapRadarSync =
    tacticalPhaseUi === 'dashboard' ||
    tacticalPhaseUi === 'schematic' ||
    tacticalPhaseUi === 'canvasScope'

  /** 카카오맵을 쓰지 않는 단독 모드에서만 38선·FMCW 락 상태 동기화(비교 모드는 왼쪽 지도가 담당) */
  useEffect(() => {
    if (!noMapRadarSync || scenarioStep !== 5 || !simPaths || !primaryEnemyForSim) {
      return
    }
    const path = simPaths.enemy.get(primaryEnemyForSim.id)
    if (!path) return
    const { lat, lng } = samplePath(path, simProgress)
    const nearDmz = simProgress > 0.01 && isEnemyNearDmz38(lat)
    if (enemyNearDmzPrevRef.current !== nearDmz) {
      enemyNearDmzPrevRef.current = nearDmz
      setEnemyNearDmz38(nearDmz)
    }
    if (radarSnapshot && fmcwInRange) {
      const radar = radarSnapshot.fmcw.radar as RadarSite
      const inCov = isEnemyInRadarCoverage(lat, lng, radar)
      if (inCov && simProgress > 0.02 && !radarDiscoveryAnnouncedRef.current) {
        radarDiscoveryAnnouncedRef.current = true
        setEnemyRadarDiscovered(true)
      }
    }
  }, [
    noMapRadarSync,
    scenarioStep,
    tacticalSubStep,
    simPaths,
    simProgress,
    primaryEnemyForSim,
    radarSnapshot,
    fmcwInRange,
  ])

  useEffect(() => {
    if (!mapVideoModal) return undefined
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMapVideoModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapVideoModal])

  /** 40km 밖: 전술 인셋을 광역 insetBounds로 복구 */
  useEffect(() => {
    if (showTacticalPip) return
    const inset = insetSceneRef.current
    if (!inset?.map || !inset.kakaoMaps) return
    const k = inset.kakaoMaps
    const ib = BATTALION_SCENARIO.insetBounds
    const sw = new k.LatLng(ib.sw.lat, ib.sw.lng)
    const ne = new k.LatLng(ib.ne.lat, ib.ne.lng)
    ;(inset.map as KakaoMap).setBounds(new k.LatLngBounds(sw, ne), 18, 18, 18, 18)
    ;(inset.map as KakaoMap).setLevel(BATTALION_SCENARIO.insetMapLevel)
    const rel = (inset.map as unknown as { relayout?: () => void }).relayout
    window.setTimeout(() => rel?.call(inset.map), 100)
  }, [showTacticalPip])

  /**
   * 40km 안: C2–적 축으로 좁은 bounds.
   * 의존성에 tacticalSimPoints 객체를 넣지 않음 — simProgress마다 참조가 바뀌어 setBounds가 ~12Hz로
   * 반복되며 타일·오버레이가 깜빡임. pipZoomTick(양자화)일 때만 갱신하고 좌표는 ref에서 읽음.
   */
  useEffect(() => {
    if (!showTacticalPip) return
    const pts = tacticalSimPointsRef.current
    if (!pts) return
    const inset = insetSceneRef.current
    if (!inset?.map || !inset.kakaoMaps) return
    const k = inset.kakaoMaps
    const tight = tightBoundsAroundC2Enemy(pts.c2, pts.enemy, 5.5)
    const sw = new k.LatLng(tight.sw.lat, tight.sw.lng)
    const ne = new k.LatLng(tight.ne.lat, tight.ne.lng)
    ;(inset.map as KakaoMap).setBounds(new k.LatLngBounds(sw, ne), 36, 36, 36, 36)
    const rel = (inset.map as unknown as { relayout?: () => void }).relayout
    window.setTimeout(() => rel?.call(inset.map), 100)
  }, [showTacticalPip, pipZoomTick])

  useEffect(() => {
    Promise.all([
      requestJson<FriendlyUnitFromApi[]>(`${getApiBaseUrl()}/map/units`),
      requestJson<EnemyInfiltration[]>(`${getApiBaseUrl()}/map/infiltrations`),
    ])
      .then(([units, infiltrations]) => {
        setFriendlyUnits(
          units.map((u) => ({
            ...u,
            situationVideoUrl:
              u.situationVideoUrl !== undefined && u.situationVideoUrl !== null
                ? u.situationVideoUrl
                : null,
          })),
        )
        setEnemyInfiltrations(infiltrations)
      })
      .catch((err) => {
        setMapError(err instanceof Error ? err.message : '지도 데이터 로드 실패')
      })
      .finally(() => {
        setMapLoading(false)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    void requestJson<RadarSnapshot>(`${getApiBaseUrl()}/map/radar/snapshot?source=live`)
      .then((snap) => {
        if (!cancelled) setRadarSnapshot(snap)
      })
      .catch(() => {
        if (!cancelled) setRadarSnapshot(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const unitCounts = useMemo(() => {
    return friendlyUnits.reduce<Record<UnitLevel, number>>(
      (acc, unit) => {
        acc[unit.level] += 1
        return acc
      },
      { 소대: 0, 중대: 0, 대대: 0 },
    )
  }, [friendlyUnits])

  /** 도로(OSRM) 궤적 비동기 로드 — 먼저 합성 궤적으로 즉시 표시 후 교체 */
  useEffect(() => {
    if (friendlyUnits.length === 0 && enemyInfiltrations.length === 0) {
      simPathsRef.current = null
      setSimPaths(null)
      setRoadPathStatus('idle')
      return
    }
    const synthetic = buildSimPaths(friendlyUnits, enemyInfiltrations)
    simPathsRef.current = synthetic
    setSimPaths(synthetic)
    setRoadPathStatus('loading')
    let cancelled = false
    void (async () => {
      try {
        const { bundle, roadCount, total } = await buildRoadAwareSimPaths(
          friendlyUnits,
          enemyInfiltrations,
        )
        if (cancelled) return
        simPathsRef.current = bundle
        setSimPaths(bundle)
        if (roadCount === 0) setRoadPathStatus('synthetic')
        else if (roadCount === total) setRoadPathStatus('all-road')
        else setRoadPathStatus('partial')
      } catch {
        if (!cancelled) {
          const fallback = buildSimPaths(friendlyUnits, enemyInfiltrations)
          simPathsRef.current = fallback
          setSimPaths(fallback)
          setRoadPathStatus('synthetic')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [friendlyUnits, enemyInfiltrations])

  /** 궤적 갱신 시 지도 위 오버레이 위치만 동기화 (지도 전체 재생성 없음) */
  useEffect(() => {
    const scene = sceneRef.current
    const inset = insetSceneRef.current
    if (!simPaths) return
    const base = simFrameOptsRef.current
    const dist = enemyDistanceFromC2Km(
      simPaths,
      simProgressRef.current,
      c2UnitForSim?.id ?? null,
      primaryEnemyForSim?.id ?? null,
    )
    const opts = mergeSimFrameOpts(base, dist)
    if (scene) applySimulationFrame(scene, simPaths, simProgressRef.current, opts)
    if (inset) applySimulationFrame(inset, simPaths, simProgressRef.current, opts)
  }, [
    simPaths,
    c2UnitForSim?.id,
    primaryEnemyForSim?.id,
    tacticDeployedUnitIds,
    simIntroActive,
  ])

  const handleLaunchUavFromBattalion = useCallback(() => {
    if (scenarioStep !== 5) return
    const now = Math.max(simProgressRef.current, wideScanPauseProgress)
    simProgressRef.current = now
    setSimProgress(now)
    setUavLaunchStartProgress(now)
    setSimPlaying(true)
    window.dispatchEvent(new CustomEvent(SIM_STARTED_EVENT))
    setTacticSaveMessage(null)
  }, [scenarioStep, wideScanPauseProgress])

  const handleConfirmUavOrder = useCallback(() => {
    setUavOrderedProfile(uavMissionProfile)
    handleLaunchUavFromBattalion()
    setUavOrderModalOpen(false)
  }, [handleLaunchUavFromBattalion, uavMissionProfile])

  const handleSelectBestTactic = useCallback(() => {
    if (!bestTacticRecommendation) return
    setSelectedTacticUnit(bestTacticRecommendation.unitName)
    setTacticSupportPopoverOpen(false)
    setTacticSaveMessage(
      `최고 적합도 자동 선택: ${bestTacticRecommendation.unitName} (${bestTacticRecommendation.suitabilityPct.toFixed(0)}%)`,
    )
  }, [bestTacticRecommendation])

  const handleSaveTacticDecision = useCallback(async () => {
    if (!selectedTacticUnit) return
    const picked = tacticRecommendations.find((r) => r.unitName === selectedTacticUnit)
    if (!picked) return
    setTacticSavePending(true)
    setTacticSaveMessage(null)
    try {
      await requestJson<{ ok: boolean; id: number; savedAt: string }>(
        `${getApiBaseUrl()}/map/tactics/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioKey: 'battalion-reconstructed-v1',
            selectedUnitName: picked.unitName,
            suitabilityPct: picked.suitabilityPct,
            note: tacticDecisionNote.trim(),
            source: 'web-ui',
            rawPayload: picked.payload,
          }),
        },
      )
      setTacticSaveMessage(
        `전술 선택 저장 완료: ${picked.unitName} (${picked.suitabilityPct.toFixed(0)}%)`,
      )
      setTacticSupportPopoverOpen(false)
    } catch (err) {
      setTacticSaveMessage(err instanceof Error ? err.message : '전술 저장 실패')
    } finally {
      setTacticSavePending(false)
    }
  }, [selectedTacticUnit, tacticRecommendations, tacticDecisionNote])

  const handleSimReset = useCallback(() => {
    simProgressRef.current = 0
    setSimProgress(0)
    setSimPlaying(false)
    radarDiscoveryAnnouncedRef.current = false
    setEnemyRadarDiscovered(false)
    enemyNearDmzPrevRef.current = false
    setEnemyNearDmz38(false)
    setScenarioStep(0)
    setTacticalSubStep(3)
    setSarContact(false)
    setUavLaunchStartProgress(null)
    setUavOrderModalOpen(false)
    setUavOrderedProfile(null)
    setUavMissionProfile('sar_eo_balanced')
    setDroneLaunchStartProgress(null)
    setUavEnemyVideoExpanded(false)
    setTacticSupportPopoverOpen(false)
    setSelectedTacticUnit(null)
    setTacticDeployedUnitIds([])
    setTacticDecisionNote('')
    setTacticSaveMessage(null)
    mapCursorSetterRef.current(null)
    const scene = sceneRef.current
    const inset = insetSceneRef.current
    const dist0 =
      simPaths != null
        ? enemyDistanceFromC2Km(
            simPaths,
            0,
            c2UnitForSim?.id ?? null,
            primaryEnemyForSim?.id ?? null,
          )
        : null
    const opts = mergeSimFrameOpts(simFrameOptsRef.current, dist0)
    if (simPaths) {
      if (scene) applySimulationFrame(scene, simPaths, 0, opts)
      if (inset) applySimulationFrame(inset, simPaths, 0, opts)
    }
  }, [simPaths, c2UnitForSim?.id, primaryEnemyForSim?.id])

  const scenarioHoldForUav =
    scenarioStep === 5 &&
    scenarioV2Phase === 'sat-wide-pause' &&
    uavLaunchStartProgress == null

  useEffect(() => {
    if (!scenarioHoldForUav && uavOrderModalOpen) {
      setUavOrderModalOpen(false)
    }
  }, [scenarioHoldForUav, uavOrderModalOpen])

  useEffect(() => {
    if (!uavOrderModalOpen) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUavOrderModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [uavOrderModalOpen])

  const scenarioTacticsPhase = scenarioV2Phase === 'tactics'
  const mapTacticSupportBarVisible =
    scenarioV2Phase === 'tactics' && mapUiActive && !mapLoading

  useEffect(() => {
    if (!scenarioTacticsPhase && tacticSupportPopoverOpen) {
      setTacticSupportPopoverOpen(false)
    }
  }, [scenarioTacticsPhase, tacticSupportPopoverOpen])

  useEffect(() => {
    if (!tacticSupportPopoverOpen) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTacticSupportPopoverOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tacticSupportPopoverOpen])

  const uavOrderedProfileTag = useMemo(() => {
    if (!uavOrderedProfile) return null
    return UAV_MISSION_PROFILES.find((p) => p.id === uavOrderedProfile)?.shortTag ?? null
  }, [uavOrderedProfile])

  const simTimelineDisabled =
    !simPaths ||
    scenarioStep !== 5 ||
    simIntroActive ||
    scenarioHoldForUav ||
    ((tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare') && mapLoading)

  const getSeekRatioFromClientX = useCallback((clientX: number) => {
    const el = simSeekTrackRef.current
    if (!el) return simProgressRef.current
    const r = el.getBoundingClientRect()
    const w = r.width
    if (w <= 0) return simProgressRef.current
    return Math.min(1, Math.max(0, (clientX - r.left) / w))
  }, [])

  const applySimAtProgress = useCallback(
    (p: number) => {
      const clamped = Math.min(1, Math.max(0, p))
      simProgressRef.current = clamped
      setSimProgress(clamped)
      if (!simPaths) return
      const scene = sceneRef.current
      const inset = insetSceneRef.current
      const dist = enemyDistanceFromC2Km(
        simPaths,
        clamped,
        c2UnitForSim?.id ?? null,
        primaryEnemyForSim?.id ?? null,
      )
      const opts = mergeSimFrameOpts(simFrameOptsRef.current, dist)
      if (scene) applySimulationFrame(scene, simPaths, clamped, opts)
      if (inset) applySimulationFrame(inset, simPaths, clamped, opts)
    },
    [simPaths, c2UnitForSim?.id, primaryEnemyForSim?.id],
  )

  const onSimSeekPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (simTimelineDisabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSimSeekDragging(true)
    applySimAtProgress(getSeekRatioFromClientX(e.clientX))
  }

  const onSimSeekPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    applySimAtProgress(getSeekRatioFromClientX(e.clientX))
  }

  const onSimSeekPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setSimSeekDragging(false)
  }

  const onSimSeekKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (simTimelineDisabled) return
    const step = e.shiftKey ? 0.1 : 0.02
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      applySimAtProgress(simProgressRef.current - step)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      applySimAtProgress(simProgressRef.current + step)
    } else if (e.key === 'Home') {
      e.preventDefault()
      applySimAtProgress(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      applySimAtProgress(1)
    }
  }

  const handleSimTogglePlay = useCallback(() => {
    setSimPlaying((wasPlaying) => {
      if (wasPlaying) {
        return false
      }
      if (simProgressRef.current >= 0.999) {
        simProgressRef.current = 0
        setSimProgress(0)
        setTacticalSubStep(3)
        radarDiscoveryAnnouncedRef.current = false
        setEnemyRadarDiscovered(false)
        enemyNearDmzPrevRef.current = false
        setEnemyNearDmz38(false)
        const scene = sceneRef.current
        const inset = insetSceneRef.current
        const dist0 =
          simPaths != null
            ? enemyDistanceFromC2Km(
                simPaths,
                0,
                c2UnitForSim?.id ?? null,
                primaryEnemyForSim?.id ?? null,
              )
            : null
        const opts = mergeSimFrameOpts(simFrameOptsRef.current, dist0)
        if (simPaths) {
          if (scene) applySimulationFrame(scene, simPaths, 0, opts)
          if (inset) applySimulationFrame(inset, simPaths, 0, opts)
        }
      }
      window.dispatchEvent(new CustomEvent(SIM_STARTED_EVENT))
      return true
    })
  }, [simPaths, c2UnitForSim?.id, primaryEnemyForSim?.id])

  useEffect(() => {
    let routeRevealTid: ReturnType<typeof setTimeout> | undefined

    if (scenarioStep !== 5 || !mapUiActive) {
      return () => {
        if (routeRevealTid !== undefined) clearTimeout(routeRevealTid)
      }
    }
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY
    if (!mapContainerRef.current || !insetMapContainerRef.current || !appKey) {
      return () => {
        if (routeRevealTid !== undefined) clearTimeout(routeRevealTid)
      }
    }

    let alive = true
    /** 평양 SAR 소실 원·라벨 — 맵 로드 직후 표시 */
    const pyongyangLossUnlockedRef = { current: true }
    /** 남하 경로 권역 — 평양 표시 후 BATTALION_ROUTE_CORRIDOR_REVEAL_MS 경과 시 */
    const routeCorridorUnlockedRef = { current: false }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-kakao-maps-sdk="true"]',
    )

    const onLoadKakaoMap = () => {
      const kakaoMaps = (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps
      if (!kakaoMaps) {
        return
      }

      kakaoMaps.load(() => {
        if (!alive || !mapContainerRef.current || !insetMapContainerRef.current) return

        mapContainerRef.current.innerHTML = ''
        insetMapContainerRef.current.innerHTML = ''

        const ob = BATTALION_SCENARIO.overviewBounds
        const mainSw = new kakaoMaps.LatLng(ob.sw.lat, ob.sw.lng)
        const mainNe = new kakaoMaps.LatLng(ob.ne.lat, ob.ne.lng)
        const mainCenter = new kakaoMaps.LatLng(
          (ob.sw.lat + ob.ne.lat) / 2,
          (ob.sw.lng + ob.ne.lng) / 2,
        )
        const map = new kakaoMaps.Map(mapContainerRef.current, {
          center: mainCenter,
          level: BATTALION_SCENARIO.overviewMapLevel,
        }) as KakaoMap
        map.setBounds(new kakaoMaps.LatLngBounds(mainSw, mainNe), 28, 28, 28, 28)
        map.setZoomable(false)

        kakaoMaps.event.addListener(map, 'mousemove', (mouseEvent: unknown) => {
          if (!alive) return
          const me = mouseEvent as { latLng: { getLat: () => number; getLng: () => number } }
          const ll = me.latLng
          mapCursorSetterRef.current({ lat: ll.getLat(), lng: ll.getLng() })
        })
        const mainMapHost = mapContainerRef.current
        const onMainMapHostLeave = () => {
          if (!alive) return
          mapCursorSetterRef.current(null)
        }
        mainMapHost?.addEventListener('mouseleave', onMainMapHostLeave)

        const ib = BATTALION_SCENARIO.insetBounds
        const insetSw = new kakaoMaps.LatLng(ib.sw.lat, ib.sw.lng)
        const insetNe = new kakaoMaps.LatLng(ib.ne.lat, ib.ne.lng)
        const insetCenter = new kakaoMaps.LatLng(
          (ib.sw.lat + ib.ne.lat) / 2,
          (ib.sw.lng + ib.ne.lng) / 2,
        )
        const insetMap = new kakaoMaps.Map(insetMapContainerRef.current, {
          center: insetCenter,
          level: BATTALION_SCENARIO.insetMapLevel,
        }) as KakaoMap
        insetMap.setBounds(new kakaoMaps.LatLngBounds(insetSw, insetNe), 18, 18, 18, 18)
        insetMap.setZoomable(false)

        simKakaoMapsRef.current = { main: map, inset: insetMap }

        const pinCtxBase = {
          kakaoMaps,
          friendlyUnits,
          enemyInfiltrations,
          radarSnapshot: radarFmcwForMap,
          radarSnapshotRef,
          openMapVideoModalRef,
          radarHoverLeaveTimerRef,
          setRadarEnemyHover,
          enableTacticalAisUi: true,
          simPathsRef,
          simProgressRef,
        }

        const mainPins = attachKakaoTacticalPins({
          ...pinCtxBase,
          map,
          enableRadarHoverPanel: true,
          overviewSarC2Dot: true,
          enemyAssetHoverRef,
        })

        const radarDisposables: Array<
          | KakaoPolygonInstance
          | KakaoCustomOverlayInstance
          | KakaoCircleInstance
          | KakaoPolylineInstance
        > = []

        const routeFrame = BATTALION_SCENARIO.expectedEnemyRouteBounds
        const routeRectPath = buildRectanglePolygonPath(kakaoMaps, routeFrame)
        const routeZonePoly = new kakaoMaps.Polygon({
          path: routeRectPath,
          strokeWeight: 4,
          strokeColor: '#1d4ed8',
          strokeOpacity: 0.92,
          fillColor: '#60a5fa',
          fillOpacity: 0.1,
          zIndex: 0,
        })
        radarDisposables.push(routeZonePoly)
        const routeZoneAnchor = new kakaoMaps.LatLng(routeFrame.sw.lat, routeFrame.ne.lng)
        const routeZoneLbl = document.createElement('div')
        routeZoneLbl.className =
          'map-overview-region-label map-overview-region-label--route'
        routeZoneLbl.innerHTML =
          '<span class="map-overview-region-label__title">남하 경로 관측 권역</span>' +
          '<span class="map-overview-region-label__sub">집결지 → 목표 축</span>'
        const routeZoneOv = new kakaoMaps.CustomOverlay({
          position: routeZoneAnchor,
          yAnchor: 0,
          xAnchor: 1,
          content: routeZoneLbl,
          zIndex: 11,
        })
        radarDisposables.push(routeZoneOv)

        const sarTankLossLayers: Array<{
          circle: KakaoCircleInstance
          ov: KakaoCustomOverlayInstance
        }> = []
        for (const z of BATTALION_SCENARIO.sarTankLossZones) {
          const zCenter = new kakaoMaps.LatLng(z.lat, z.lng)
          const sarCircle = new kakaoMaps.Circle({
            center: zCenter,
            radius: z.radiusM,
            strokeWeight: 1,
            strokeColor: '#fca5a5',
            strokeOpacity: 0.45,
            fillColor: '#fecaca',
            fillOpacity: 0.08,
            zIndex: 1,
          })
          radarDisposables.push(sarCircle)
          const sarLbl = document.createElement('div')
          sarLbl.className = 'sar-tank-loss-label'
          if ('labelHtml' in z && z.labelHtml) {
            sarLbl.innerHTML = z.labelHtml
          } else {
            sarLbl.textContent = z.label
          }
          const sarLblOv = new kakaoMaps.CustomOverlay({
            position: zCenter,
            yAnchor: 0,
            xAnchor: 0.5,
            content: sarLbl,
            zIndex: 12,
          })
          radarDisposables.push(sarLblOv)
          sarTankLossLayers.push({ circle: sarCircle, ov: sarLblOv })
        }

        const syncBattalionRegions = (_progress: number) => {
          if (simIntroActiveRef.current) {
            routeZonePoly.setMap(null)
            routeZoneOv.setMap(null)
            for (const layer of sarTankLossLayers) {
              layer.circle.setMap(null)
              layer.ov.setMap(null)
            }
            return
          }
          const lossVisible = pyongyangLossUnlockedRef.current
          const routeVisible = routeCorridorUnlockedRef.current
          if (routeVisible) {
            routeZonePoly.setMap(map)
            routeZoneOv.setMap(map)
          } else {
            routeZonePoly.setMap(null)
            routeZoneOv.setMap(null)
          }
          if (lossVisible) {
            for (const layer of sarTankLossLayers) {
              layer.circle.setMap(map)
              layer.ov.setMap(map)
            }
          } else {
            for (const layer of sarTankLossLayers) {
              layer.circle.setMap(null)
              layer.ov.setMap(null)
            }
          }
        }

        pyongyangLossUnlockedRef.current = true
        routeCorridorUnlockedRef.current = false
        if (routeRevealTid !== undefined) {
          clearTimeout(routeRevealTid)
          routeRevealTid = undefined
        }
        routeRevealTid = window.setTimeout(() => {
          if (!alive) return
          routeCorridorUnlockedRef.current = true
          sceneRef.current?.battalionRegionsSync?.(simProgressRef.current)
        }, BATTALION_ROUTE_CORRIDOR_REVEAL_MS)

        syncBattalionRegions(simProgressRef.current)

        if (radarFmcwForMap) {
          const R = radarFmcwForMap.fmcw.radar
          const sectorPts = buildRadarSectorPath(
            R.lat,
            R.lng,
            R.rangeMaxM,
            R.headingDeg,
            R.fovDeg,
          )
          const path = sectorPts.map((p) => new kakaoMaps.LatLng(p.lat, p.lng))
          const sectorPoly = new kakaoMaps.Polygon({
            path,
            strokeWeight: 1,
            strokeColor: '#7dd3fc',
            strokeOpacity: 0.35,
            fillColor: '#bae6fd',
            fillOpacity: 0.06,
            zIndex: 2,
          })
          sectorPoly.setMap(map)
          radarDisposables.push(sectorPoly)

          const radarPos = new kakaoMaps.LatLng(R.lat, R.lng)
          const radarPinEl = document.createElement('div')
          radarPinEl.className = 'radar-site-pin-anchor'
          radarPinEl.title = R.label
          radarPinEl.innerHTML =
            '<div class="radar-site-icon radar-site-icon--fmcw" aria-hidden="true"><span class="radar-site-icon-inner">F</span></div>'

          const radarSiteOv = new kakaoMaps.CustomOverlay({
            map,
            position: radarPos,
            yAnchor: 1,
            xAnchor: 0.5,
            content: radarPinEl,
            zIndex: 5,
          })
          radarDisposables.push(radarSiteOv)

          const futureTraj = radarFmcwForMap.fmcw.insights?.futureTrajectoryLatLng
          const futureTrajOk =
            futureTraj && futureTraj.length >= 2 ? futureTraj : null
          const track = radarFmcwForMap.fmcw.track
          const trackDupFuture =
            futureTrajOk &&
            track &&
            latLngPolylineAlmostEqual(track.predictedPath, futureTrajOk)

          if (futureTrajOk) {
            const futPath = futureTrajOk.map((p) => new kakaoMaps.LatLng(p.lat, p.lng))
            const futLine = new kakaoMaps.Polyline({
              path: futPath,
              strokeWeight: 4,
              strokeColor: '#22d3ee',
              strokeOpacity: 0.92,
              strokeStyle: 'solid',
              zIndex: 5,
            })
            futLine.setMap(map)
            radarDisposables.push(futLine)

            // 지도 중앙 가림을 줄이기 위해 텍스트 말풍선 대신 경로선만 유지.
          }

          if (track && track.predictedPath.length >= 2 && !trackDupFuture) {
            const trackPath = track.predictedPath.map(
              (p) => new kakaoMaps.LatLng(p.lat, p.lng),
            )
            const trackLine = new kakaoMaps.Polyline({
              path: trackPath,
              strokeWeight: 3,
              strokeColor: '#f97316',
              strokeOpacity: 0.85,
              strokeStyle: 'dash',
              zIndex: 4,
            })
            trackLine.setMap(map)
            radarDisposables.push(trackLine)

            // 지도 중앙 가림을 줄이기 위해 텍스트 말풍선 대신 경로선만 유지.
          }

          const riskZones = radarFmcwForMap.fmcw.insights?.vodRiskZones
          if (riskZones && riskZones.length > 0) {
            for (const zone of riskZones) {
              if (!zone.polygon || zone.polygon.length < 3) continue
              const riskPath = zone.polygon.map(
                (p) => new kakaoMaps.LatLng(p.lat, p.lng),
              )
              const riskPoly = new kakaoMaps.Polygon({
                path: riskPath,
                strokeWeight: 2,
                strokeColor: '#b91c1c',
                strokeOpacity: 0.85,
                fillColor: '#ef4444',
                fillOpacity: 0.14,
                zIndex: 3,
              })
              riskPoly.setMap(map)
              radarDisposables.push(riskPoly)
            }
          }

          radarFmcwForMap.fmcw.detections.forEach((det) => {
            const detPos = new kakaoMaps.LatLng(det.lat, det.lng)
            const dot = document.createElement('button')
            dot.type = 'button'
            dot.className = 'radar-detection-dot'
            dot.style.background = dopplerMarkerColor(det.dopplerMps)
            dot.setAttribute('aria-label', `FMCW 탐지 ${det.id}`)

            const dotOv = new kakaoMaps.CustomOverlay({
              map,
              position: detPos,
              yAnchor: 0.5,
              xAnchor: 0.5,
              content: dot,
              zIndex: 6,
            })
            radarDisposables.push(dotOv)

            const infoEl = document.createElement('div')
            infoEl.className =
              'unit-map-overlay radar-detection-infowindow map-hover-side-card map-hover-side-card--radar'
            infoEl.innerHTML = `
              <span class="radar-badge">FMCW 탐지</span>
              <p><strong>거리 (range)</strong> ${det.rangeM.toLocaleString('ko-KR')} m</p>
              <p><strong>방위각 (azimuth)</strong> ${det.azimuthDeg}° (북 기준)</p>
              <p><strong>위상 (phase)</strong> ${det.phaseDeg}°</p>
              <p><strong>고도 (elevation)</strong> ${det.elevationDeg}°</p>
              <p><strong>도플러 (Doppler)</strong> ${det.dopplerMps} m/s</p>
              <p><strong>신뢰도</strong> ${(det.confidence * 100).toFixed(0)}%</p>
              <p><strong>좌표(WGS84)</strong> ${formatLatLngReadout(det.lat, det.lng)}</p>
              <p><strong>MGRS</strong> ${latLngToMgrsSafe(det.lat, det.lng)}</p>
            `
            const infoOv = new kakaoMaps.CustomOverlay({
              position: detPos,
              yAnchor: 0.5,
              xAnchor: 0,
              content: infoEl,
              zIndex: 7,
            })
            infoOv.setMap(null)
            let hideTimer: number | null = null
            const clearHide = () => {
              if (hideTimer != null) {
                window.clearTimeout(hideTimer)
                hideTimer = null
              }
            }
            const scheduleHide = () => {
              clearHide()
              hideTimer = window.setTimeout(() => infoOv.setMap(null), 180)
            }
            dot.addEventListener('mouseenter', () => {
              clearHide()
              infoOv.setMap(map)
            })
            dot.addEventListener('mouseleave', scheduleHide)
            infoEl.addEventListener('mouseenter', clearHide)
            infoEl.addEventListener('mouseleave', scheduleHide)
            radarDisposables.push(infoOv)
          })
        }

        const pathsBundle =
          simPathsRef.current ?? buildSimPaths(friendlyUnits, enemyInfiltrations)
        const c2Unit = friendlyUnits.find(isBattalionC2Unit)
        const primaryEnemy = pickPrimaryEnemyForDistance(enemyInfiltrations)
        let droneAssetOverlay: KakaoCustomOverlayInstance | undefined
        let droneAssetEl: HTMLDivElement | undefined

        if (primaryEnemy) {
          const dronePos = polarToLatLngWeb(primaryEnemy.lat, primaryEnemy.lng, 700, 315)
          droneAssetEl = document.createElement('div')
          droneAssetEl.className = 'map-drone-asset'
          droneAssetEl.innerHTML =
            '<span class="map-drone-asset__icon" aria-hidden="true">🛸</span><span class="map-drone-asset__label">DRONE</span>'
          droneAssetOverlay = new kakaoMaps.CustomOverlay({
            position: new kakaoMaps.LatLng(dronePos.lat, dronePos.lng),
            yAnchor: 1,
            xAnchor: 0.5,
            content: droneAssetEl,
            zIndex: 13,
          })
          droneAssetOverlay.setMap(null)
          radarDisposables.push(droneAssetOverlay)
        }

        sceneRef.current = {
          kakaoMaps,
          map,
          units: mainPins.units,
          enemies: mainPins.enemies,
          droneAssetOverlay,
          droneAssetEl,
          c2UnitId: c2Unit?.id,
          primaryEnemyId: primaryEnemy?.id,
          radarDisposables:
            radarDisposables.length > 0 ? radarDisposables : undefined,
          battalionRegionsSync: syncBattalionRegions,
        }

        const insetPins = attachKakaoTacticalPins({
          ...pinCtxBase,
          map: insetMap,
          enableRadarHoverPanel: false,
          insetMinimal,
        })

        let c2Line: KakaoPolylineInstance | undefined
        let distOv: KakaoCustomOverlayInstance | undefined
        let distEl: HTMLDivElement | undefined
        let c2Uid: number | undefined
        let eid: number | undefined

        if (c2Unit && primaryEnemy && sarContact && scenarioStep === 5) {
          c2Uid = c2Unit.id
          eid = primaryEnemy.id
          const p0 = new kakaoMaps.LatLng(c2Unit.lat, c2Unit.lng)
          const p1 = new kakaoMaps.LatLng(primaryEnemy.lat, primaryEnemy.lng)
          c2Line = new kakaoMaps.Polyline({
            path: [p0, p1],
            strokeWeight: 2,
            strokeColor: '#facc15',
            strokeOpacity: 0.42,
            strokeStyle: 'solid',
            zIndex: 4,
          })
          c2Line.setMap(insetMap)
          distEl = document.createElement('div')
          distEl.className = 'map-c2-distance-chip'
          distEl.textContent = `적–지휘통제실 ${haversineKm(c2Unit, primaryEnemy).toFixed(1)} km`
          const midLat = (c2Unit.lat + primaryEnemy.lat) / 2
          const midLng = (c2Unit.lng + primaryEnemy.lng) / 2
          distOv = new kakaoMaps.CustomOverlay({
            map: insetMap,
            position: new kakaoMaps.LatLng(midLat, midLng),
            yAnchor: 0.5,
            xAnchor: 0.5,
            content: distEl,
            zIndex: 20,
          })
        }

        insetSceneRef.current = {
          kakaoMaps,
          map: insetMap,
          units: insetPins.units,
          enemies: insetPins.enemies,
          c2EnemyLine: c2Line,
          distanceLabelOverlay: distOv,
          distanceLabelEl: distEl,
          c2UnitId: c2Uid,
          primaryEnemyId: eid,
        }

        if (pathsBundle.friendly.size > 0 || pathsBundle.enemy.size > 0) {
          const dist = enemyDistanceFromC2Km(
            pathsBundle,
            simProgressRef.current,
            c2Unit?.id ?? null,
            primaryEnemy?.id ?? null,
          )
          const o = mergeSimFrameOpts(simFrameOptsRef.current, dist)
          applySimulationFrame(sceneRef.current, pathsBundle, simProgressRef.current, o)
          if (insetSceneRef.current) {
            applySimulationFrame(insetSceneRef.current, pathsBundle, simProgressRef.current, o)
          }
        }
        queueMicrotask(() => setSimMapZoomRevision((r) => r + 1))
      })
    }

    if (existingScript && (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps) {
      onLoadKakaoMap()
      return () => {
        alive = false
        if (routeRevealTid !== undefined) clearTimeout(routeRevealTid)
        mapCursorSetterRef.current(null)
        simKakaoMapsRef.current = { main: null, inset: null }
        sceneRef.current = null
        insetSceneRef.current = null
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = ''
        }
        if (insetMapContainerRef.current) {
          insetMapContainerRef.current.innerHTML = ''
        }
      }
    }

    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
    script.async = true
    script.dataset.kakaoMapsSdk = 'true'
    script.onload = onLoadKakaoMap
    document.head.appendChild(script)

    return () => {
      alive = false
      if (routeRevealTid !== undefined) clearTimeout(routeRevealTid)
      mapCursorSetterRef.current(null)
      simKakaoMapsRef.current = { main: null, inset: null }
      sceneRef.current = null
      insetSceneRef.current = null
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = ''
      }
      if (insetMapContainerRef.current) {
        insetMapContainerRef.current.innerHTML = ''
      }
    }
  }, [
    friendlyUnits,
    enemyInfiltrations,
    radarSnapshot,
    sarContact,
    scenarioStep,
    tacticalSubStep,
    radarFmcwForMap,
    insetMinimal,
    tacticalPhaseUi,
    mapUiActive,
  ])

  useEffect(() => {
    if (scenarioStep !== 5 || !mapUiActive) return
    sceneRef.current?.battalionRegionsSync?.(simProgress)
  }, [scenarioStep, simProgress, mapUiActive, simIntroActive])

  useEffect(() => {
    if (!simPlaying || !simPaths) {
      return
    }

    let last = performance.now()
    let lastUiEmit = last
    let rafId = 0

    const tick = (now: number) => {
      const scene = sceneRef.current
      const inset = insetSceneRef.current
      if (!scene) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const dt = (now - last) / 1000
      last = now
      simProgressRef.current = Math.min(
        1,
        simProgressRef.current + (dt * simSpeed) / SIM_DURATION_SEC,
      )
      const dist = enemyDistanceFromC2Km(
        simPaths,
        simProgressRef.current,
        c2UnitForSim?.id ?? null,
        primaryEnemyForSim?.id ?? null,
      )
      const o = mergeSimFrameOpts(simFrameOptsRef.current, dist)
      applySimulationFrame(scene, simPaths, simProgressRef.current, o)
      if (inset) {
        applySimulationFrame(inset, simPaths, simProgressRef.current, o)
      }

      if (now - lastUiEmit > 80) {
        lastUiEmit = now
        setSimProgress(simProgressRef.current)
      }

      if (simProgressRef.current >= 1) {
        setSimProgress(1)
        setSimPlaying(false)
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [simPlaying, simSpeed, simPaths, c2UnitForSim?.id, primaryEnemyForSim?.id])

  return (
    <section className="page">
      <h1>{BATTALION_SCENARIO.title}</h1>
      <p className="muted">
        {scenarioStep === 0 ? (
          <>
            <strong>0</strong> 요약 → <strong>1~3</strong> 센서 → <strong>4</strong> 드론 EO/IR 식별 →{' '}
            <strong>5</strong> 통합 상황(지도·시뮬·40km/15km).
          </>
        ) : scenarioStep === 1 ? (
          <>1단계: SAR 광역 탐지·변화분석.</>
        ) : scenarioStep === 2 ? (
          <>2단계: UAV 실시간 추적·EO/IR.</>
        ) : scenarioStep === 3 ? (
          <>3단계: FMCW·VoD 근거리 레이더.</>
        ) : scenarioStep === 4 ? (
          <>4단계: 드론 EO/IR 식별 — 웹 파이프라인 4번, 정찰 영상·식별 흐름.</>
        ) : (
          <>
            5단계: 통합 상황 — C2 기준 <strong>40km</strong> 전술 권역, <strong>15km</strong> FMCW, 지도·시뮬·전술.
          </>
        )}
      </p>
      {user ? (
        <>
          <p>
            현재 로그인: <strong>{user.email}</strong>
          </p>
          <p className="muted">아군 부대·적 표적·드론 영상(핀 호버/클릭).</p>
        </>
      ) : (
        <p>로그인 후 전 기능을 이용할 수 있습니다.</p>
      )}

      {scenarioStep === 0 && <ScenarioFlowOverview onStart={() => setScenarioStep(1)} />}

      {scenarioStep === 1 && (
        <AirborneSarPage
          onContinue={() => {
            setScenarioStep(2)
            setSarContact(true)
          }}
        />
      )}

      {scenarioStep === 2 && <UavSarPage onContinue={() => setScenarioStep(3)} />}

      {scenarioStep === 3 && (
        <FmcwRadarIntroPage
          onContinue={() => {
            setTacticalSubStep(3)
            setScenarioStep(4)
          }}
        />
      )}

      {scenarioStep === 4 && (
        <DroneEoIrIdentificationPanel
          embedded
          scenarioNext={{ label: '5단계: 통합 상황', onContinue: () => setScenarioStep(5) }}
        />
      )}

      {scenarioStep === 5 && (
      <>
      <div className="kpi-grid" style={{ marginTop: '1rem' }}>
        <article className="kpi-card safe">
          <p className="kpi-label">소대 수</p>
          <strong className="kpi-value">{unitCounts.소대}</strong>
        </article>
        <article className="kpi-card neutral">
          <p className="kpi-label">중대 수</p>
          <strong className="kpi-value">{unitCounts.중대}</strong>
        </article>
        <article className="kpi-card warning">
          <p className="kpi-label">대대 수</p>
          <strong className="kpi-value">{unitCounts.대대}</strong>
        </article>
        <article className="kpi-card danger">
          <p className="kpi-label">감시·추적 표적(적)</p>
          <strong className="kpi-value">{enemyInfiltrations.length}</strong>
        </article>
      </div>

      {mapError && <p className="error">{mapError}</p>}

      <div className="map-section">
        <h2 className="map-title">
          통합 상황도 · 대대 전술 상황도
          {tacticalSubStep === 3
            ? ' · 전술 권역 밖(40km 미진입)'
            : tacticalSubStep === 4
              ? ' · 전술 권역(≤40km)'
              : ' · FMCW(≤15km)'}
        </h2>
        <div className="scenario-theory-apply-panel" role="region" aria-label="통합 상황 표적 요약">
          <h3 className="scenario-theory-apply-panel__title">표적 요약</h3>
          <p className="scenario-theory-apply-panel__lead muted">
            C2–표적 방위·이동 방향·거리(≤40km 전술, ≤15km FMCW).
          </p>
          {tacticalSimPoints && c2UnitForSim ? (
            enemySuppressedByBestTactic ? (
              <p className="muted scenario-theory-apply-panel__pending">
                <strong>최적 전술 적용</strong> — 추천 1위 부대로 표적이 제압된 상태입니다. 지도·전술 뷰에서 적 표시가
                제거됩니다.
              </p>
            ) : primaryEnemyForSim ? (
              <dl className="scenario-theory-apply-panel__metrics">
                <div>
                  <dt>우선 표적</dt>
                  <dd>
                    <strong>{primaryEnemyForSim.codename}</strong> · {primaryEnemyForSim.enemyBranch}
                  </dd>
                </div>
                <div>
                  <dt>지휘통제실→표적 방위</dt>
                  <dd>
                    <strong>{tacticalSimPoints.bearing.toFixed(1)}°</strong> (
                    {bearingToCardinalKo(tacticalSimPoints.bearing)} 방향)
                  </dd>
                </div>
                <div>
                  <dt>표적 이동 방향(궤적 접선)</dt>
                  <dd>
                    {enemyMovementBearingDeg != null ? (
                      <>
                        <strong>{enemyMovementBearingDeg.toFixed(1)}°</strong> (
                        {bearingToCardinalKo(enemyMovementBearingDeg)} 쪽으로 진행)
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>C2–표적 거리</dt>
                  <dd>
                    {enemyDistanceKm != null ? (
                      <strong>{enemyDistanceKm.toFixed(2)} km</strong>
                    ) : (
                      '타임라인 재생 후 표시'
                    )}
                  </dd>
                </div>
                {radarSnapshot && fmcwInRange ? (
                  <>
                    <div>
                      <dt>FMCW 탐지 점(스냅샷)</dt>
                      <dd>
                        <strong>{radarSnapshot.fmcw.detections.length}</strong>개
                      </dd>
                    </div>
                    {radarSnapshot.fmcw.track ? (
                      <div>
                        <dt>FMCW 트랙 방위(스냅샷)</dt>
                        <dd>
                          <strong>{radarSnapshot.fmcw.track.bearingDeg}°</strong>
                        </dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="muted scenario-theory-apply-panel__pending">부대·적 궤적을 불러오면 수치가 채워집니다.</p>
            )
          ) : (
            <p className="muted scenario-theory-apply-panel__pending">부대·적 궤적을 불러오면 수치가 채워집니다.</p>
          )}
        </div>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          도로·보조 궤적 · 40km 전술 · 15km FMCW · ≤{SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM}km 드론 EO/IR. 하단에서 지도/카드
          등 전환.
        </p>
        <section className="scenario-v2-panel" aria-label="상황 타임라인">
          <div className="scenario-v2-panel__head">
            <h3>상황 진행</h3>
            <span className="scenario-v2-panel__clock">
              경과(표시) {Math.round(simProgress * 50)}분 · 위성 SAR 갱신 {SAR_UPDATE_INTERVAL_HOURS}시간/회
            </span>
          </div>
          <p className="muted scenario-v2-panel__desc">
            흐름: <strong>평양 적 소실·SAR 신호 소실</strong> → 약 {Math.round(BATTALION_ROUTE_CORRIDOR_REVEAL_MS / 1000)}초 뒤{' '}
            <strong>남하 경로 관측 권역</strong> → 표적이 해당 권역에 진입하면 <strong>궤적 포착(의심 표적)</strong> →{' '}
            <strong>UAV 출정 승인</strong> 후 이동·추적 → 40km·15km·드론 순 연계.
          </p>
          <div className="scenario-v2-panel__status">
            <strong>현재 단계:</strong>{' '}
            {scenarioV2Phase === 'sat-watch'
              ? simProgress < enemyCorridorEntryProgress
                ? '위성 SAR 감시 — 평양 소실·남하 권역 분석'
                : '남하 관측 권역 — 이동체 궤적 포착(의심 표적)'
              : scenarioV2Phase === 'sat-wide-pause'
                ? 'UAV 출정 승인 대기 — 식별·연속 추적 확정(일시정지)'
                : scenarioV2Phase === 'uav-transit'
                  ? 'UAV 출동 — 군사분계선 접근(5분 할당)'
                  : scenarioV2Phase === 'uav-track-only'
                    ? 'UAV 추적·식별(광역 권역 · 표적 위치 제한 공개)'
                    : scenarioV2Phase === 'tactical-mid'
                      ? '전술 권역(15~40km) 추적'
                      : scenarioV2Phase === 'fmcw-drone-transit'
                        ? 'FMCW 단계 · 드론 전장 이동(5분)'
                        : '전술 선택 지원 단계'}
          </div>
          <div className="scenario-v2-panel__metrics">
            <span>추정 표적 거리: 약 {narrativeEnemyDistanceKm.toFixed(1)} km</span>
            {uavLaunchStartProgress != null && (
              <span>UAV 이동률 {Math.round(uavTransitRatio * 100)}%</span>
            )}
            {droneLaunchStartProgress != null && (
              <span>드론 이동률 {Math.round(droneTransitRatio * 100)}%</span>
            )}
          </div>
        </section>
        {scenarioHoldForUav && (
          <div className="scenario-uav-mandatory-strip" role="status" aria-live="polite">
            <span className="scenario-uav-mandatory-strip__dot" aria-hidden />
            <div className="scenario-uav-mandatory-strip__text">
              <strong className="scenario-uav-mandatory-strip__title">필수 조치: UAV 출정 승인</strong>
              <span className="scenario-uav-mandatory-strip__sub">
                상황이 일시 정지되어 있습니다. 상태 안내 바로 아래 <strong>UAV 출정 승인</strong>을 눌러 출정 절차를 진행하세요.
              </span>
            </div>
          </div>
        )}
        {simIntroActive && (
          <div className="sim-intro-positions-banner" role="status" aria-live="polite">
            <span className="sim-intro-positions-banner__dot" aria-hidden />
            <div className="sim-intro-positions-banner__text">
              <strong className="sim-intro-positions-banner__title">초기 배치 확인</strong>
              <span className="sim-intro-positions-banner__sub">
                적·아군 시작 위치만 표시 중입니다. 약 {Math.round(SIM_INTRO_POSITIONS_MS / 1000)}초 후 타임라인·재생이
                활성화됩니다.
              </span>
            </div>
          </div>
        )}
        {simSarLossAlertVisible && !simIntroActive && (
          <div
            className="sim-sar-loss-alert"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <span className="sim-sar-loss-alert__icon" aria-hidden>
              !
            </span>
            <div className="sim-sar-loss-alert__body">
              <strong className="sim-sar-loss-alert__title">경고 · 위성 SAR 신호 손실</strong>
              <p className="sim-sar-loss-alert__line">
                위성 SAR 연속 궤적이 끊겼습니다. 평양·후방 소실 구간에서 <strong>적 표적이 관측 화면에서 사라졌습니다</strong>.
              </p>
              <p className="sim-sar-loss-alert__line sim-sar-loss-alert__line--sub">
                남하 관측 권역 재포착 및 UAV·다중 센서로 표적을 재확정해야 합니다. 타임라인 재생으로 상황을 전개하세요.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary sim-sar-loss-alert__dismiss"
              onClick={() => setSimSarLossAlertVisible(false)}
            >
              확인
            </button>
          </div>
        )}
        <div className="sim-toolbar">
          <button
            type="button"
            className="btn-primary"
            disabled={simTimelineDisabled}
            onClick={handleSimTogglePlay}
          >
            {simPlaying ? '일시정지' : '상황 재생'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={simTimelineDisabled}
            onClick={handleSimReset}
          >
            처음으로
          </button>
          <div className="sim-toolbar__quick-actions">
            {scenarioV2Phase === 'tactics' && !mapTacticSupportBarVisible && (
              <button
                type="button"
                className={`map-tactic-support-cta${tacticSupportPopoverOpen ? ' map-tactic-support-cta--open' : ''}${selectedTacticUnit ? ' map-tactic-support-cta--picked' : ''}`}
                onClick={() => setTacticSupportPopoverOpen((o) => !o)}
                title={
                  selectedTacticUnit
                    ? `선택: ${selectedTacticUnit} — 클릭하여 패널 열기/닫기`
                    : '화면 중앙 패널에서 부대를 고르고 저장합니다'
                }
              >
                <span className="map-uav-mandatory-cta__title">
                  전술 지원
                  {selectedTacticUnit ? ` · ${selectedTacticUnit}` : ''}
                </span>
              </button>
            )}
          </div>
          <label className="sim-speed-label">
            속도
            <select
              value={simSpeed}
              disabled={simTimelineDisabled}
              onChange={(e) => setSimSpeed(Number(e.target.value) as 0.5 | 1 | 2)}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </label>
          <div
            ref={simSeekTrackRef}
            className={`sim-progress-wrap sim-progress-wrap--seekable${simSeekDragging ? ' sim-progress-wrap--dragging' : ''}${simTimelineDisabled ? ' sim-progress-wrap--disabled' : ''}`}
            role="slider"
            tabIndex={simTimelineDisabled ? -1 : 0}
            aria-label="작전 타임라인"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(simProgress * 100)}
            aria-valuetext={`${formatSimClock(simProgress, SIM_DURATION_SEC)} / ${formatSimClock(1, SIM_DURATION_SEC)}`}
            aria-disabled={simTimelineDisabled}
            onPointerDown={onSimSeekPointerDown}
            onPointerMove={onSimSeekPointerMove}
            onPointerUp={onSimSeekPointerUp}
            onPointerCancel={onSimSeekPointerUp}
            onKeyDown={onSimSeekKeyDown}
          >
            <div className="sim-progress-bar" style={{ width: `${simProgress * 100}%` }} />
            <div
              className="sim-progress-thumb"
              style={{ left: `${simProgress * 100}%` }}
              aria-hidden
            />
          </div>
          <span className="muted sim-progress-label">
            {formatSimClock(simProgress, SIM_DURATION_SEC)} / {formatSimClock(1, SIM_DURATION_SEC)} ·{' '}
            {Math.round(simProgress * 100)}% · 드래그·<span className="sim-progress-label__kbd">←→</span>·
            <span className="sim-progress-label__kbd">Home</span>/<span className="sim-progress-label__kbd">End</span>
          </span>
          <div className="tactical-ui-mode" role="group" aria-label="통합 상황 표시 방식">
            <span className="tactical-ui-mode__label muted">통합 상황</span>
            <button
              type="button"
              className={`btn-secondary tactical-ui-mode__btn${tacticalPhaseUi === 'map' ? ' tactical-ui-mode__btn--active' : ''}`}
              onClick={() => setTacticalPhaseUi('map')}
            >
              지도
            </button>
            <button
              type="button"
              className={`btn-secondary tactical-ui-mode__btn${tacticalPhaseUi === 'dashboard' ? ' tactical-ui-mode__btn--active' : ''}`}
              onClick={() => setTacticalPhaseUi('dashboard')}
            >
              카드
            </button>
            <button
              type="button"
              className={`btn-secondary tactical-ui-mode__btn${tacticalPhaseUi === 'schematic' ? ' tactical-ui-mode__btn--active' : ''}`}
              onClick={() => setTacticalPhaseUi('schematic')}
              title="위·경도만 투영한 초간소 SVG (타일 없음)"
            >
              간소 SVG
            </button>
            <button
              type="button"
              className={`btn-secondary tactical-ui-mode__btn${tacticalPhaseUi === 'canvasScope' ? ' tactical-ui-mode__btn--active' : ''}`}
              onClick={() => setTacticalPhaseUi('canvasScope')}
              title="HTML Canvas 2D PPI 스코프"
            >
              Canvas
            </button>
            <button
              type="button"
              className={`btn-secondary tactical-ui-mode__btn${tacticalPhaseUi === 'compare' ? ' tactical-ui-mode__btn--active' : ''}`}
              onClick={() => setTacticalPhaseUi('compare')}
              title="왼쪽 카카오 지도 + 오른쪽 패널 선택"
            >
              나란히
            </button>
            {tacticalPhaseUi === 'compare' && (
              <label className="tactical-compare-right-select">
                <span className="muted">오른쪽</span>
                <select
                  value={compareRightPane}
                  onChange={(e) =>
                    setCompareRightPane(e.target.value as 'dashboard' | 'schematic' | 'canvasScope')
                  }
                >
                  <option value="schematic">간소 SVG</option>
                  <option value="dashboard">카드 대시보드</option>
                  <option value="canvasScope">Canvas PPI</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {uavOrderModalOpen && scenarioHoldForUav && (
          <div
            className="uav-order-modal-backdrop"
            role="presentation"
            onClick={() => setUavOrderModalOpen(false)}
          >
            <div
              className="uav-order-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={uavOrderModalTitleId}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="uav-order-modal__head">
                <div>
                  <p className="uav-order-modal__badge">지휘 명령 절차</p>
                  <h3 id={uavOrderModalTitleId} className="uav-order-modal__title">
                    무인기(UAV) 출정 승인
                  </h3>
                  <p className="muted uav-order-modal__sub">프로파일 선택 후 명령 하달.</p>
                </div>
                <button
                  type="button"
                  className="uav-order-modal__close"
                  aria-label="닫기"
                  onClick={() => setUavOrderModalOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="uav-order-modal__body">
                <div className="uav-order-modal__order-box" aria-label="작전 요지">
                  <p className="uav-order-modal__order-label">작전 요지 (요약)</p>
                  <ul className="uav-order-modal__order-list">
                    <li>
                      발신: <strong>{c2UnitForSim?.name ?? '지휘통제실'}</strong> · SAR 광역 이상 징후 구역 기준
                    </li>
                    <li>
                      우선 표적: <strong>{primaryEnemyForSim?.codename ?? '미지정'}</strong>
                      {primaryEnemyForSim
                        ? ` · ${primaryEnemyForSim.enemyBranch} · 위협 ${primaryEnemyForSim.threatLevel}`
                        : null}
                    </li>
                    <li>경로: 대대 기지 → 군사분계선 접근 → 광역 추적(표적 위치 비공개 구간 포함)</li>
                  </ul>
                </div>
                <p className="uav-order-modal__section-title">임무 프로파일 선택</p>
                <ul className="uav-order-modal__options" role="radiogroup" aria-label="UAV 임무 프로파일">
                  {UAV_MISSION_PROFILES.map((p) => (
                    <li key={p.id}>
                      <label
                        className={`uav-order-modal__opt${uavMissionProfile === p.id ? ' uav-order-modal__opt--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="uav-mission-profile"
                          value={p.id}
                          checked={uavMissionProfile === p.id}
                          onChange={() => setUavMissionProfile(p.id)}
                        />
                        <span className="uav-order-modal__opt-body">
                          <span className="uav-order-modal__opt-title">{p.title}</span>
                          <span className="uav-order-modal__opt-detail">{p.detail}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="uav-order-modal__ack" role="note">
                  <span className="uav-order-modal__ack-mark" aria-hidden>
                    ✓
                  </span>
                  절차 확인: SAR 2차 광역 탐지 및 이상 징후 검토 후 출정 명령
                </p>
              </div>
              <div className="uav-order-modal__footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setUavOrderModalOpen(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn-primary uav-order-modal__confirm-mandatory"
                  onClick={handleConfirmUavOrder}
                >
                  명령 하달 · UAV 출정
                </button>
              </div>
            </div>
          </div>
        )}

        {tacticSupportPopoverOpen &&
          scenarioV2Phase === 'tactics' &&
          createPortal(
            <div className="tactic-popover-portal">
              <div
                className="tactic-popover-backdrop"
                role="presentation"
                aria-hidden
                onClick={() => setTacticSupportPopoverOpen(false)}
              />
              <div
                className="tactic-popover"
                role="dialog"
                aria-modal="true"
                aria-labelledby={tacticPopoverTitleId}
                onClick={(e) => e.stopPropagation()}
              >
              <div className="tactic-popover__head">
                <div className="tactic-popover__head-text">
                  <p className="tactic-popover__badge">지휘결심 지원</p>
                  <h3 id={tacticPopoverTitleId} className="tactic-popover__title">
                    전술 선택
                  </h3>
                  <p className="muted tactic-popover__lead">
                    지도가 보이는 화면 위쪽 중앙에 뜹니다. 배경을 누르거나 닫기로 접을 수 있습니다.
                  </p>
                </div>
                <div className="tactic-popover__head-actions">
                  {bestTacticRecommendation ? (
                    <button
                      type="button"
                      className="btn-secondary tactic-popover__head-btn"
                      onClick={handleSelectBestTactic}
                      title={`${bestTacticRecommendation.unitName} (${bestTacticRecommendation.suitabilityPct.toFixed(0)}%)`}
                    >
                      최적 적용
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="tactic-popover__close"
                    aria-label="패널 닫기"
                    onClick={() => setTacticSupportPopoverOpen(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="tactic-popover__body">
                {tacticLoading ? (
                  <p className="muted tactic-popover__status">전술 추천을 불러오는 중…</p>
                ) : tacticRecommendations.length === 0 ? (
                  <p className="muted tactic-popover__status">추천 데이터가 없습니다.</p>
                ) : (
                  <div className="tactic-decision-panel__list tactic-popover__list">
                    {tacticRecommendations.map((rec) => (
                      <label key={rec.unitName} className="tactic-decision-panel__item">
                        <input
                          type="radio"
                          name="tactic-unit-popover"
                          checked={selectedTacticUnit === rec.unitName}
                          onChange={() => {
                            setSelectedTacticUnit(rec.unitName)
                            setTacticSupportPopoverOpen(false)
                          }}
                        />
                        <span className="tactic-decision-panel__item-main">
                          <strong>{rec.unitName}</strong>
                          <em>{rec.suitabilityPct.toFixed(0)}% 적합</em>
                        </span>
                        <span className="tactic-decision-panel__item-sub">{rec.rationale}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="tactic-popover__footer">
                <textarea
                  className="tactic-decision-panel__note tactic-popover__note"
                  value={tacticDecisionNote}
                  onChange={(e) => setTacticDecisionNote(e.target.value)}
                  placeholder="지휘관 메모 (선택)"
                  rows={2}
                />
                <div className="tactic-popover__footer-row">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!selectedTacticUnit || tacticSavePending}
                    onClick={() => void handleSaveTacticDecision()}
                  >
                    {tacticSavePending ? '저장 중…' : '선택 전술 DB 저장'}
                  </button>
                  {tacticSaveMessage ? (
                    <span className="muted tactic-popover__save-msg">{tacticSaveMessage}</span>
                  ) : null}
                </div>
              </div>
            </div>
            </div>,
            document.body,
          )}

        {roadPathStatus === 'loading' && (
          <p className="muted road-path-hint">도로 궤적 계산 중(OSRM)…</p>
        )}
        {roadPathStatus === 'all-road' && (
          <p className="muted road-path-hint">적 남하 단방향 · 아군 고정.</p>
        )}
        {roadPathStatus === 'partial' && (
          <p className="muted road-path-hint">일부 구간 보조 궤적(OSRM 미적용).</p>
        )}
        {roadPathStatus === 'synthetic' &&
          (friendlyUnits.length > 0 || enemyInfiltrations.length > 0) && (
          <p className="muted road-path-hint">도로 매칭 없이 보조 궤적 표시 — 백엔드·네트워크 확인.</p>
        )}
        {mapLoading && (tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare') && (
          <p className="muted">지도 데이터 로딩 중...</p>
        )}

        {scenarioStep === 5 &&
          enemyDistanceKm != null &&
          enemyDistanceKm > SCENARIO_RANGES_KM.TACTICAL_RANGE_KM && (
          <div className="scenario-standby-banner" role="status">
            <span className="scenario-standby-banner__badge">대기</span>
            <span>
              적 <strong>40km 밖</strong> — 재생 시 남하, 진입 시 PiP·인셋 강조.
            </span>
          </div>
        )}
        {droneDispatchActive && (
          <div className="scenario-drone-banner" role="status">
            <span className="scenario-drone-banner__badge">드론</span>
            <span>
              <strong>EO/IR 정찰</strong> — C2 기준 ≤{SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM}km. 핀 클릭 재생.
            </span>
          </div>
        )}
        {enemyRadarDiscovered && scenarioStep === 5 && tacticalSubStep >= 5 && (
          <div className="scenario-discover-alert" role="alert">
            <span className="scenario-discover-alert__badge">FMCW</span>
            <span>
              <strong>FMCW ≤15km</strong> — 핀 클릭 시 영상.
            </span>
          </div>
        )}
        {enemyNearDmz38 && (
          <div className="scenario-dmz-alert" role="status">
            <span className="scenario-dmz-alert__badge">38선</span>
            <span>
              <strong>휴전선 인접</strong> — 지도 주황 점선.
            </span>
          </div>
        )}
        {scenarioStep === 5 && fmcwInRange && (
          <div className="scenario-red-alert" role="alert">
            <span className="scenario-red-alert__badge">FMCW</span>
            <span>
              <strong>FMCW 활성</strong> — 방위·예측 궤적 표시. 드론: 지도/카드에서 재생.
            </span>
          </div>
        )}
        {scenarioStep === 5 &&
          scenarioV2Phase === 'tactics' &&
          tacticDeployedUnitLabels.length > 0 && (
            <div className="scenario-tactic-deploy-banner" role="status">
              <span className="scenario-tactic-deploy-banner__badge">출전</span>
              <span>
                <strong>선택 전술</strong> — 지도상 전진 배치:{' '}
                {tacticDeployedUnitLabels.join(' · ')}
              </span>
            </div>
          )}
        {scenarioStep === 5 && scenarioV2Phase === 'tactics' && enemySuppressedByBestTactic && (
          <div className="scenario-tactic-suppress-banner" role="status" aria-live="polite">
            <span className="scenario-tactic-suppress-banner__badge">제압</span>
            <span>
              <strong>최적 전술 적용</strong> — 추천 1위 부대 배치로 표적 구역이 정리되었습니다. 지도에서{' '}
              <strong>적 표적이 제거</strong>된 상태로 표시됩니다. 다른 부대를 고르면 다시 나타납니다.
            </span>
          </div>
        )}

        {scenarioHoldForUav &&
          (tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare') &&
          mapUiActive &&
          !mapLoading && (
            <div className="map-uav-mandatory-bar" role="region" aria-label="UAV 출정 승인">
              <button
                type="button"
                className="map-uav-mandatory-cta"
                onClick={() => setUavOrderModalOpen(true)}
              >
                <span className="map-uav-mandatory-cta__title">UAV 출정 승인</span>
              </button>
            </div>
          )}

        {mapTacticSupportBarVisible && (
          <div className="map-tactic-support-bar" role="region" aria-label="전술 지원">
            <button
              type="button"
              className={`map-tactic-support-cta${tacticSupportPopoverOpen ? ' map-tactic-support-cta--open' : ''}${selectedTacticUnit ? ' map-tactic-support-cta--picked' : ''}`}
              onClick={() => setTacticSupportPopoverOpen((o) => !o)}
              title={
                selectedTacticUnit
                  ? `선택: ${selectedTacticUnit} — 클릭하여 패널 열기/닫기`
                  : '전술 추천·저장 패널을 엽니다'
              }
            >
              <span className="map-uav-mandatory-cta__title">
                전술 지원
                {selectedTacticUnit ? ` · ${selectedTacticUnit}` : ''}
              </span>
            </button>
          </div>
        )}

        <div
          className={`tactical-phase-body tactical-phase-body--${tacticalPhaseUi}`}
        >
        {(tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare') && (
        <div className="tactical-phase-pane tactical-phase-pane--map">
        <div
          className={`map-battalion-grid${showTacticalPip ? ' map-battalion-grid--pip-active' : ' map-battalion-grid--overview-solo'}`}
        >
          <div className="map-battalion-col map-battalion-col--overview">
            <div className="map-ais-workbench">
              <div
                className={`map-ais-workbench__mapcol${
                  uavEnemyVideoExpanded ? ' map-ais-workbench__mapcol--focus' : ''
                }`}
              >
            <div className="map-with-radar-hover">
              <div
                className={`map-overview-stack${showTacticalPip ? ' map-overview-stack--has-pip' : ''}`}
              >
                <div className="map-main-overview-wrap">
                  <div ref={mapContainerRef} className="maplibre-container map-main-overview" />
                </div>
                {mapUiActive && !mapLoading && (
                  <div
                    className="map-sim-zoom map-sim-zoom--main"
                    role="group"
                    aria-label="광역 지도 확대·축소"
                  >
                    <button
                      type="button"
                      className="map-sim-zoom__btn"
                      onClick={simMainMapZoomIn}
                      disabled={!simMainZoomEnabled.zoomIn}
                      title="확대"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="map-sim-zoom__btn"
                      onClick={simMainMapZoomOut}
                      disabled={!simMainZoomEnabled.zoomOut}
                      title="축소"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="map-sim-zoom__btn map-sim-zoom__btn--fit"
                      onClick={simMainMapFitBounds}
                      title="초기 표시 범위로 맞춤"
                    >
                      맞춤
                    </button>
                  </div>
                )}
                <div
                  className={`map-tactical-pip${showTacticalPip ? ' map-tactical-pip--visible' : ' map-tactical-pip--hidden'}`}
                  aria-hidden={!showTacticalPip}
                >
                  <div className="map-tactical-pip__chrome">
                    <span className="map-tactical-pip__title">전술 대치 · 확대</span>
                    <span className="map-tactical-pip__chrome-right">
                      {enemyDistanceKm != null && (
                        <span className="map-tactical-pip__dist">{enemyDistanceKm.toFixed(1)} km</span>
                      )}
                      {droneDispatchActive && (
                        <span className="map-tactical-pip__drone-rec">드론 EO/IR 촬영·전송</span>
                      )}
                    </span>
                  </div>
                  <div
                    className={`map-tactical-pip__body map-inset-stack${showTacticalPip ? ' map-inset-stack--focus' : ''}`}
                  >
                    <div
                      ref={insetMapContainerRef}
                      className="maplibre-container map-inset-tactical map-inset-tactical--pip"
                    />
                    {mapUiActive && !mapLoading && showTacticalPip && (
                      <div
                        className="map-sim-zoom map-sim-zoom--inset"
                        role="group"
                        aria-label="전술 확대 지도 확대·축소"
                      >
                        <button
                          type="button"
                          className="map-sim-zoom__btn map-sim-zoom__btn--compact"
                          onClick={simInsetMapZoomIn}
                          disabled={!simInsetZoomEnabled.zoomIn}
                          title="확대"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="map-sim-zoom__btn map-sim-zoom__btn--compact"
                          onClick={simInsetMapZoomOut}
                          disabled={!simInsetZoomEnabled.zoomOut}
                          title="축소"
                        >
                          −
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {(scenarioV2Phase === 'uav-track-only' ||
                  scenarioV2Phase === 'tactical-mid' ||
                  scenarioV2Phase === 'fmcw-drone-transit' ||
                  scenarioV2Phase === 'tactics') &&
                  primaryEnemyForSim?.droneVideoUrl && (
                    <button
                      type="button"
                      className={`scenario-corner-video scenario-corner-video--left${
                        uavEnemyVideoExpanded ? ' scenario-corner-video--expanded' : ''
                      }`}
                      onClick={() => setUavEnemyVideoExpanded((v) => !v)}
                      title="클릭: 초협소 구역 확대/원복"
                    >
                      <span className="scenario-corner-video__head">
                        UAV 식별 영상 · {uavEnemyVideoExpanded ? '원복' : '확대'}
                      </span>
                      <video src={primaryEnemyForSim.droneVideoUrl} autoPlay muted loop playsInline />
                      <span className="scenario-corner-video__hint">
                        탱크/일반차량 분류 + 동일 객체 연속성 확인
                      </span>
                    </button>
                  )}
                {((scenarioV2Phase === 'fmcw-drone-transit' && droneTransitRatio >= 0.35) ||
                  scenarioV2Phase === 'tactics') &&
                  primaryEnemyForSim?.droneVideoUrl && (
                    <div className="scenario-corner-video scenario-corner-video--right">
                      <span className="scenario-corner-video__head">YOLO 기반 전차 판별</span>
                      <video
                        src={YOLO_TANK_CORNER_VIDEO_URL}
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                      <span className="scenario-corner-video__hint">
                        드론 전장 도달 후 우상단 판별 영상(맵 고정 영역)
                      </span>
                    </div>
                  )}
                {uavLaunchStartProgress != null && (
                  <div className="scenario-asset-chip scenario-asset-chip--uav">
                    <strong>UAV-01</strong>
                    {uavOrderedProfileTag ? (
                      <>
                        {' '}
                        · <span className="scenario-asset-chip__profile">{uavOrderedProfileTag}</span>
                      </>
                    ) : null}{' '}
                    대대→군사분계선 이동 {Math.round(uavTransitRatio * 100)}%
                  </div>
                )}
                {droneLaunchStartProgress != null && (
                  <div className="scenario-asset-chip scenario-asset-chip--drone">
                    <strong>DRONE-EOIR</strong> 전장 접근 {Math.round(droneTransitRatio * 100)}%
                  </div>
                )}
              </div>
        {radarEnemyHover && radarSnapshot && radarHoverMetrics && (
          <div
            className="radar-enemy-hover-panel"
            role="dialog"
            aria-label="지상감시 레이더(FMCW) 표적 Range–Azimuth"
            onMouseEnter={clearRadarHoverTimer}
            onMouseLeave={scheduleRadarHoverClear}
          >
            <div className="radar-enemy-hover-panel__head">
              <div>
                <p className="radar-enemy-hover-panel__badge">레이더 범위 내 표적</p>
                <h3 className="radar-enemy-hover-panel__title">{radarEnemyHover.codename}</h3>
                <p className="muted radar-enemy-hover-panel__sub">
                  {radarEnemyHover.enemyBranch} · 위협 {radarEnemyHover.threatLevel}
                </p>
              </div>
              <button
                type="button"
                className="radar-enemy-hover-panel__close"
                aria-label="닫기"
                onClick={() => {
                  clearRadarHoverTimer()
                  setRadarEnemyHover(null)
                }}
              >
                ×
              </button>
            </div>
            <p className="radar-enemy-hover-panel__hint muted">
              동일 스냅샷 기준 <strong>Range–Azimuth</strong> 차트(색=도플러). VoD 파이프라인에서는 3D 포인트 추출을
              사용하지 않습니다.
            </p>
            <div className="radar-enemy-hover-panel__chart">
              <RadarCharts2D detections={radarSnapshot.fmcw.detections} />
            </div>
            <dl className="radar-enemy-hover-panel__metrics">
              <div>
                <dt>거리 range</dt>
                <dd>{radarHoverMetrics.rangeM.toLocaleString('ko-KR')} m</dd>
              </div>
              <div>
                <dt>방위 azimuth</dt>
                <dd>{radarHoverMetrics.azimuthDeg}° (북 기준)</dd>
              </div>
              <div>
                <dt>고도 elevation</dt>
                <dd>{radarHoverMetrics.elevationDeg}°</dd>
              </div>
              <div>
                <dt>도플러 Doppler</dt>
                <dd>{radarHoverMetrics.dopplerMps} m/s</dd>
              </div>
              <div>
                <dt>주시 대비 편각</dt>
                <dd>{radarHoverMetrics.offBoresightDeg}°</dd>
              </div>
              <div>
                <dt>위험 반경 / 추정</dt>
                <dd>
                  {radarEnemyHover.riskRadiusMeter.toLocaleString('ko-KR')} m ·{' '}
                  {radarEnemyHover.estimatedCount}명
                </dd>
              </div>
              <div>
                <dt>좌표(WGS84)</dt>
                <dd>{formatLatLngReadout(radarEnemyHover.lat, radarEnemyHover.lng)}</dd>
              </div>
              <div>
                <dt>MGRS</dt>
                <dd>{latLngToMgrsSafe(radarEnemyHover.lat, radarEnemyHover.lng)}</dd>
              </div>
            </dl>
          </div>
        )}
        {enemyMapVisible && mapEnemyAssetHover && (
          <div
            className="map-enemy-asset-float"
            role="dialog"
            aria-label="표적 재원(호버)"
            onMouseEnter={clearEnemyAssetFloatTimer}
            onMouseLeave={scheduleEnemyAssetFloatHide}
          >
            <div className="map-enemy-asset-float__head">
              <div>
                <p className="map-enemy-asset-float__badge">표적 재원</p>
                <h4 className="map-enemy-asset-float__title">{mapEnemyAssetHover.codename}</h4>
                <p className="muted map-enemy-asset-float__sub">
                  {mapEnemyAssetHover.enemyBranch} · 위협 {mapEnemyAssetHover.threatLevel}
                </p>
              </div>
              <button
                type="button"
                className="map-enemy-asset-float__close"
                aria-label="닫기"
                onClick={() => {
                  clearEnemyAssetFloatTimer()
                  setMapEnemyAssetHover(null)
                }}
              >
                ×
              </button>
            </div>
            {mapEnemyHoverKinematics && (
              <dl className="map-ais-asset-panel__kinematics map-enemy-asset-float__kin">
                <div>
                  <dt>이동속도</dt>
                  <dd>
                    {mapEnemyHoverKinematics.spd != null
                      ? `${mapEnemyHoverKinematics.spd.toFixed(1)} km/h`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>좌표(WGS84)</dt>
                  <dd>
                    {formatLatLngReadout(mapEnemyHoverKinematics.lat, mapEnemyHoverKinematics.lng)}
                  </dd>
                </div>
                <div>
                  <dt>MGRS</dt>
                  <dd>{latLngToMgrsSafe(mapEnemyHoverKinematics.lat, mapEnemyHoverKinematics.lng)}</dd>
                </div>
                <div>
                  <dt>표고</dt>
                  <dd>{mapEnemyHoverKinematics.elev} m</dd>
                </div>
                {mapEnemyHoverKinematics.brg != null && (
                  <div>
                    <dt>이동 방위</dt>
                    <dd>
                      {mapEnemyHoverKinematics.brg.toFixed(0)}° (
                      {bearingToCardinalKo(mapEnemyHoverKinematics.brg)})
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <dl className="map-ais-asset-panel__specs map-enemy-asset-float__specs">
              <div>
                <dt>병과</dt>
                <dd>{mapEnemyAssetHover.enemyBranch}</dd>
              </div>
              <div>
                <dt>위협</dt>
                <dd>{mapEnemyAssetHover.threatLevel}</dd>
              </div>
              <div>
                <dt>추정 인원</dt>
                <dd>{mapEnemyAssetHover.estimatedCount}명</dd>
              </div>
              <div>
                <dt>관측 시각</dt>
                <dd>{mapEnemyAssetHover.observedAt}</dd>
              </div>
              <div>
                <dt>위험 반경</dt>
                <dd>{mapEnemyAssetHover.riskRadiusMeter.toLocaleString('ko-KR')} m</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn-primary map-ais-asset-panel__video map-enemy-asset-float__video"
              onClick={() => {
                clearEnemyAssetFloatTimer()
                setMapEnemyAssetHover(null)
                setMapVideoModal(enemyIntelVideoModalState(mapEnemyAssetHover))
              }}
            >
              집결 영상 · UAV
            </button>
          </div>
        )}
            </div>
                <footer className="map-cursor-readout" role="status">
                  <span className="map-cursor-readout__label">커서 위치</span>
                  <span className="map-cursor-readout__coords">
                    {mapCursorLatLng
                      ? formatLatLngWithMgrsReadout(mapCursorLatLng.lat, mapCursorLatLng.lng)
                      : '지도 위에 마우스를 올리면 WGS84 위·경도와 MGRS가 표시됩니다.'}
                  </span>
                </footer>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}

        {tacticalPhaseUi === 'dashboard' && (
          <div className="tactical-phase-pane tactical-phase-pane--dashboard">
            <h3 className="map-subtitle">카드형 대시보드 (타일 지도 없음)</h3>
            <p className="muted map-subtitle-hint">
              거리 게이지·스캔 원·FMCW 차트를 한 화면에 모았습니다. 카카오맵의 핀·SAR·다중 레이어 없이 동일한 표적·거리
              값을 표시합니다.
            </p>
            <TacticalPhaseDashboard
              enemyDistanceKm={tacticalEnemyDistanceKm}
              simProgress={simProgress}
              tacticalSubStep={tacticalSubStep}
              fmcwInRange={fmcwInRange}
              c2Name={c2UnitForSim?.name ?? '지휘통제실'}
              enemy={tacticalEnemyDisplay}
              radarCharts={tacticalDashboardRadarCharts}
              onOpenDroneVideo={() => {
                if (!primaryEnemyForSim) return
                setMapVideoModal(enemyIntelVideoModalState(primaryEnemyForSim))
              }}
            />
          </div>
        )}

        {tacticalPhaseUi === 'schematic' && schematicBounds && tacticalSimPoints && (
          <div className="tactical-phase-pane tactical-phase-pane--schematic">
            <h3 className="map-subtitle">간소 전술 도식 (SVG)</h3>
            <p className="muted map-subtitle-hint">
              위·경도만 직교 투영한 선화면입니다. 38선·C2·적·거리선·FMCW 부채꼴만 남기고 위성 타일·부대 핀·SAR 원은
              제거했습니다.
            </p>
            <TacticalSchematicMap
              bounds={schematicBounds}
              c2={tacticalSimPoints.c2}
              enemy={enemySuppressedByBestTactic ? null : tacticalSimPoints.enemy}
              enemyDistanceKm={tacticalEnemyDistanceKm}
              fmcwInRange={fmcwInRange}
              c2Name={c2UnitForSim?.name ?? '지휘통제실'}
              enemyName={primaryEnemyForSim?.codename ?? '우선 표적'}
            />
            {tacticalSubStep >= 5 && primaryEnemyForSim && (
              <div className="tactical-alt-drone-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setMapVideoModal(enemyIntelVideoModalState(primaryEnemyForSim))
                  }}
                >
                  집결 영상 · UAV
                </button>
              </div>
            )}
          </div>
        )}

        {tacticalPhaseUi === 'canvasScope' && tacticalSimPoints && (
          <div className="tactical-phase-pane tactical-phase-pane--canvas">
            <h3 className="map-subtitle">평면 위치 표시 (HTML Canvas 2D)</h3>
            <p className="muted map-subtitle-hint">
              PPI 스타일로 방위 그리드·거리 링·주시축·표적 블립만 그립니다. 지도 SDK와 별도로 Canvas API만
              사용합니다.
            </p>
            <TacticalRadarCanvas
              bearingToEnemyDeg={tacticalSimPoints.bearing}
              rangeKm={tacticalEnemyDistanceKm}
              maxRangeKm={radarCanvasConfig.maxRangeKm}
              fmcwInRange={fmcwInRange}
              radarHeadingDeg={radarCanvasConfig.headingDeg}
              radarFovDeg={radarCanvasConfig.fovDeg}
            />
            {tacticalSubStep >= 5 && primaryEnemyForSim && (
              <div className="tactical-alt-drone-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setMapVideoModal(enemyIntelVideoModalState(primaryEnemyForSim))
                  }}
                >
                  집결 영상 · UAV
                </button>
              </div>
            )}
          </div>
        )}

        {tacticalPhaseUi === 'compare' && (
          <div
            className={`tactical-phase-pane tactical-phase-pane--compare-right tactical-phase-pane--alt-${compareRightPane}`}
          >
            <h3 className="map-subtitle">
              오른쪽 ·{' '}
              {compareRightPane === 'dashboard'
                ? '카드 대시보드'
                : compareRightPane === 'schematic'
                  ? '간소 SVG'
                  : 'Canvas PPI'}
            </h3>
            <p className="muted map-subtitle-hint">
              왼쪽은 기존 카카오맵(전 기능), 오른쪽은 저밀도 표현만 둔 비교용 패널입니다.
            </p>
            {compareRightPane === 'dashboard' && (
              <TacticalPhaseDashboard
                enemyDistanceKm={tacticalEnemyDistanceKm}
                simProgress={simProgress}
                tacticalSubStep={tacticalSubStep}
                fmcwInRange={fmcwInRange}
                c2Name={c2UnitForSim?.name ?? '지휘통제실'}
                enemy={tacticalEnemyDisplay}
                radarCharts={tacticalDashboardRadarCharts}
                onOpenDroneVideo={() => {
                  if (!primaryEnemyForSim) return
                  setMapVideoModal(enemyIntelVideoModalState(primaryEnemyForSim))
                }}
              />
            )}
            {compareRightPane === 'schematic' && schematicBounds && tacticalSimPoints && (
              <TacticalSchematicMap
                bounds={schematicBounds}
                c2={tacticalSimPoints.c2}
                enemy={enemySuppressedByBestTactic ? null : tacticalSimPoints.enemy}
                enemyDistanceKm={tacticalEnemyDistanceKm}
                fmcwInRange={fmcwInRange}
                c2Name={c2UnitForSim?.name ?? '지휘통제실'}
                enemyName={primaryEnemyForSim?.codename ?? '우선 표적'}
              />
            )}
            {compareRightPane === 'canvasScope' && tacticalSimPoints && (
              <TacticalRadarCanvas
                bearingToEnemyDeg={tacticalSimPoints.bearing}
                rangeKm={tacticalEnemyDistanceKm}
                maxRangeKm={radarCanvasConfig.maxRangeKm}
                fmcwInRange={fmcwInRange}
                radarHeadingDeg={radarCanvasConfig.headingDeg}
                radarFovDeg={radarCanvasConfig.fovDeg}
              />
            )}
          </div>
        )}
        </div>

        {fmcwInRange && radarSnapshot && (
          <div className="radar-fmcw-panel" aria-label="FMCW 위험 예측 파이프라인 안내">
            <p className="radar-fmcw-panel__title radar-fmcw-panel__title--compact">
              <strong>{radarSnapshot.fmcw.radar.label}</strong>
              <span className="radar-fmcw-panel__chip">센서: {radarSnapshot.fmcw.meta.sensor}</span>
              {radarSnapshot.fmcw.meta.liveRun?.ok ? (
                <span className="radar-fmcw-panel__chip radar-fmcw-panel__chip--live">
                  실제 파이프라인 · 프레임 {radarSnapshot.fmcw.meta.liveRun.frameId ?? '—'}
                  {radarSnapshot.fmcw.meta.liveRun.prevFrameId
                    ? ` ←속도용 ${radarSnapshot.fmcw.meta.liveRun.prevFrameId}`
                    : ''}{' '}
                  · {radarSnapshot.fmcw.meta.liveRun.inferMs ?? '—'} ms
                </span>
              ) : radarSnapshot.fmcw.meta.liveRun && !radarSnapshot.fmcw.meta.liveRun.ok ? (
                <span
                  className="radar-fmcw-panel__chip radar-fmcw-panel__chip--warn"
                  title={radarSnapshot.fmcw.meta.liveRun.error}
                >
                  live 실패 · 보조 탐지 표시
                </span>
              ) : null}
            </p>

            <FmcwPipelineGuide
              detectionCount={radarSnapshot.fmcw.detections.length}
              frameId={
                radarSnapshot.fmcw.insights?.frameId ?? radarSnapshot.fmcw.meta.liveRun?.frameId ?? null
              }
              prevFrameId={radarSnapshot.fmcw.meta.liveRun?.prevFrameId ?? null}
              hasRiskZones={(radarSnapshot.fmcw.insights?.vodRiskZones?.length ?? 0) > 0}
              hasFutureTrajectory={
                (radarSnapshot.fmcw.track?.predictedPath?.length ?? 0) >= 2 ||
                (radarSnapshot.fmcw.insights?.futureTrajectoryLatLng?.length ?? 0) >= 2
              }
            />

            <details className="fmcw-reference-details">
              <summary className="fmcw-reference-details__summary">
                표현 방식·시나리오·학습 메모 · 센서 수치 (펼치기)
              </summary>
              <div className="fmcw-reference-details__body">
                <p className="muted radar-fmcw-panel__text">{radarSnapshot.fmcw.meta.representationNote}</p>
                <p className="muted radar-fmcw-panel__text">{radarSnapshot.fmcw.meta.vodReferenceNote}</p>
                <details className="radar-methodology">
                  <summary className="radar-methodology__summary">시나리오·전처리·학습 개요</summary>
                  <div className="radar-methodology__body">
                    <section className="radar-methodology__section">
                      <h4 className="radar-methodology__h">민간 차량 시나리오</h4>
                      <p className="muted">{radarSnapshot.fmcw.meta.methodology.scenarioNote}</p>
                    </section>
                    <section className="radar-methodology__section">
                      <h4 className="radar-methodology__h">시선·주행 방향·레이더와의 거리</h4>
                      <p className="muted">{radarSnapshot.fmcw.meta.methodology.poseAndDistanceNote}</p>
                    </section>
                    <section className="radar-methodology__section">
                      <h4 className="radar-methodology__h">전처리</h4>
                      <p className="muted">{radarSnapshot.fmcw.meta.methodology.preprocessingNote}</p>
                    </section>
                    <section className="radar-methodology__section">
                      <h4 className="radar-methodology__h">모델 학습(개요)</h4>
                      <p className="muted">{radarSnapshot.fmcw.meta.methodology.trainingNote}</p>
                    </section>
                  </div>
                </details>
                <ul className="radar-fmcw-panel__stats">
                  <li>
                    FMCW 최대 거리{' '}
                    <strong>{radarSnapshot.fmcw.radar.rangeMaxM.toLocaleString('ko-KR')} m</strong>
                  </li>
                  <li>
                    시야각 <strong>{radarSnapshot.fmcw.radar.fovDeg}°</strong> · 주시 방위{' '}
                    <strong>{radarSnapshot.fmcw.radar.headingDeg}°</strong>
                  </li>
                  <li>
                    FMCW 탐지 <strong>{radarSnapshot.fmcw.detections.length}</strong> (점: 도플러 색 — 접근 파랑 /
                    이탈 빨강)
                  </li>
                  <li>
                    주황/청록: 예측 궤적 · 붉은 영역: 위험 · 핀 호버: RA 요약.
                  </li>
                </ul>
              </div>
            </details>

            {radarSnapshot.fmcw.detections.length > 0 && radarSnapshot.fmcw.insights && (
              <details className="fmcw-snapshot-details" open>
                <summary className="fmcw-snapshot-details__summary">
                  이번 실행: 동기 데이터·차트·LiDAR (펼치기)
                </summary>
                <div className="fmcw-snapshot-details__body">
              <>
                <div className="radar-fmcw-insights" aria-label="파이프라인 입력·요약">
                  <h3 className="radar-fmcw-insights__title">VoD 동기 요약</h3>
                  <dl className="radar-fmcw-insights__dl">
                    <div>
                      <dt>프레임 ID</dt>
                      <dd>{radarSnapshot.fmcw.insights.frameId ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>카메라 입력</dt>
                      <dd>
                        {radarSnapshot.fmcw.insights.annotatedImageBase64
                          ? 'image_2 동기 .jpg → YOLO 검출·오버레이'
                          : '이번 실행에 카메라/오버레이 없음 (레이더·LiDAR만 가능)'}
                      </dd>
                    </div>
                    <div>
                      <dt>객체(주요)</dt>
                      <dd>
                        {radarSnapshot.fmcw.insights.primaryObject ? (
                          <>
                            <strong>{radarSnapshot.fmcw.insights.primaryObject.label}</strong> · 신뢰도{' '}
                            {(radarSnapshot.fmcw.insights.primaryObject.confidence * 100).toFixed(1)}%
                          </>
                        ) : (
                          'YOLO 검출 없음 또는 비어 있음'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>레이더 처리</dt>
                      <dd>
                        {radarSnapshot.fmcw.meta.liveRun?.radarPipeline ?? '—'} · 원시 점{' '}
                        {radarSnapshot.fmcw.meta.liveRun?.radarPointCount ?? '—'}개
                      </dd>
                    </div>
                    {radarSnapshot.fmcw.insights.motionAnalysis ? (
                      <div>
                        <dt>연속 프레임(레이더)</dt>
                        <dd>
                          Δt {radarSnapshot.fmcw.insights.motionAnalysis.frameDeltaS ?? '—'}s · 매칭{' '}
                          {radarSnapshot.fmcw.insights.motionAnalysis.associations ?? '—'}/
                          {radarSnapshot.fmcw.insights.motionAnalysis.prevClusterCount ?? '—'} ·{' '}
                          <span className="muted">
                            {radarSnapshot.fmcw.insights.motionAnalysis.note ?? ''}
                          </span>
                        </dd>
                      </div>
                    ) : null}
                    {radarSnapshot.fmcw.insights.ruleBasedRiskPrimary ? (
                      <div>
                        <dt>규칙 기반 위험도(1위)</dt>
                        <dd>
                          <strong>{radarSnapshot.fmcw.insights.ruleBasedRiskPrimary.level ?? '—'}</strong> · 점수{' '}
                          {radarSnapshot.fmcw.insights.ruleBasedRiskPrimary.score?.toFixed(3) ?? '—'}
                        </dd>
                      </div>
                    ) : null}
                    {radarSnapshot.fmcw.insights.riskModel?.note ? (
                      <div>
                        <dt>위험 모델 로드맵</dt>
                        <dd className="muted">
                          [{radarSnapshot.fmcw.insights.riskModel.mode ?? '—'}]{' '}
                          {radarSnapshot.fmcw.insights.riskModel.note}
                        </dd>
                      </div>
                    ) : null}
                    {radarSnapshot.fmcw.insights.lidarCrossChecks &&
                    radarSnapshot.fmcw.insights.lidarCrossChecks.length > 1 ? (
                      <div>
                        <dt>LiDAR 교차검증(상위 후보)</dt>
                        <dd>
                          <ul className="radar-fmcw-vod-prov__list">
                            {radarSnapshot.fmcw.insights.lidarCrossChecks.map((c) => (
                              <li key={`lcc-${c.rank}-${c.clusterId}`}>
                                #{c.rank} {c.clusterId}: {c.verdict ?? '—'} · ROI {c.pointsInRoi ?? '—'}점
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {radarSnapshot.fmcw.insights.conclusionBullets &&
                    radarSnapshot.fmcw.insights.conclusionBullets.length > 0 && (
                      <div className="radar-fmcw-conclusion">
                        <h4 className="radar-fmcw-conclusion__title">획득 정보</h4>
                        <ul className="radar-fmcw-conclusion__list">
                          {radarSnapshot.fmcw.insights.conclusionBullets.map((line, i) => (
                            <li key={`cb-${i}`}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  {radarSnapshot.fmcw.insights.vodStoryParagraph ? (
                    <div className="radar-fmcw-vod-story" aria-label="VoD 프레임 내러티브">
                      <h4 className="radar-fmcw-conclusion__title">VoD 동기 프레임 — 출처·방향·위험 예측</h4>
                      <p className="radar-fmcw-vod-story__body">
                        {radarSnapshot.fmcw.insights.vodStoryParagraph}
                      </p>
                    </div>
                  ) : null}
                  {radarSnapshot.fmcw.insights.vodProvenance ? (
                    <div className="radar-fmcw-vod-prov" aria-label="사용 데이터 출처">
                      <h4 className="radar-fmcw-conclusion__title">쓰인 입력 파일·파이프라인</h4>
                      <dl className="radar-fmcw-insights__dl">
                        <div>
                          <dt>동기 프레임 수(풀)</dt>
                          <dd>
                            {radarSnapshot.fmcw.insights.vodProvenance.syncedFrameCount ?? '—'}개 중 1개 선택
                          </dd>
                        </div>
                        <div>
                          <dt>데이터 루트</dt>
                          <dd className="radar-fmcw-vod-prov__mono">
                            {radarSnapshot.fmcw.insights.vodProvenance.datasetRootHint
                              ? radarSnapshot.fmcw.insights.vodProvenance.datasetRootHint.replace(
                                  /^(.*)([\\/][^\\/]+[\\/][^\\/]+)$/,
                                  '…$2',
                                )
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>입력 스트림</dt>
                          <dd>
                            <ul className="radar-fmcw-vod-prov__list">
                              {radarSnapshot.fmcw.insights.vodProvenance.dataSources.map((s, i) => (
                                <li key={`vds-${i}`}>{s}</li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                        <div>
                          <dt>처리 요약</dt>
                          <dd>{radarSnapshot.fmcw.insights.vodProvenance.pipelineLine}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                  {radarSnapshot.fmcw.insights.vodMatchedTarget ? (
                    <div className="radar-fmcw-vod-target" aria-label="BEV 라벨 정합">
                      <h4 className="radar-fmcw-conclusion__title">대상 기하(라벨 정합 시)</h4>
                      <dl className="radar-fmcw-insights__dl">
                        <div>
                          <dt>클래스</dt>
                          <dd>
                            <strong>{radarSnapshot.fmcw.insights.vodMatchedTarget.className ?? '—'}</strong>
                          </dd>
                        </div>
                        <div>
                          <dt>BEV 정합 거리</dt>
                          <dd>
                            {radarSnapshot.fmcw.insights.vodMatchedTarget.matchDistanceM != null
                              ? `${radarSnapshot.fmcw.insights.vodMatchedTarget.matchDistanceM} m`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>헤딩(ego XY)</dt>
                          <dd>
                            {radarSnapshot.fmcw.insights.vodMatchedTarget.headingDegEgoXY != null
                              ? `${radarSnapshot.fmcw.insights.vodMatchedTarget.headingDegEgoXY}°`
                              : '—'}
                            {radarSnapshot.fmcw.insights.vodMatchedTarget.headingNote ? (
                              <span className="muted"> — {radarSnapshot.fmcw.insights.vodMatchedTarget.headingNote}</span>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt>박스 크기 (L×W)</dt>
                          <dd>
                            {radarSnapshot.fmcw.insights.vodMatchedTarget.lengthM ?? '—'}m ×{' '}
                            {radarSnapshot.fmcw.insights.vodMatchedTarget.widthM ?? '—'}m
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                  {radarSnapshot.fmcw.insights.vodRiskZones &&
                    radarSnapshot.fmcw.insights.vodRiskZones.length > 0 && (
                      <div className="radar-fmcw-vod-risk" aria-label="위험 구역 설명">
                        <h4 className="radar-fmcw-conclusion__title">지도 위험 영역 (부채꼴)</h4>
                        <ul className="radar-fmcw-conclusion__list">
                          {radarSnapshot.fmcw.insights.vodRiskZones.map((z) => (
                            <li key={z.id}>
                              <strong>{z.label}</strong> — {z.rationale}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>

                <div className="radar-fmcw-synced" aria-label="동기 시점 카메라 (VoD)">
                  <div className="radar-fmcw-synced__pane radar-fmcw-synced__pane--full">
                    <p className="radar-fmcw-synced__cap">카메라 입력 (YOLO 오버레이)</p>
                    <p className="muted radar-fmcw-synced__hint">
                      레이더·LiDAR와 동일 stem 프레임의 영상입니다. 레이더는 아래 Range–Azimuth 차트로 표시합니다.
                    </p>
                    {radarSnapshot.fmcw.insights.annotatedImageBase64 ? (
                      <img
                        src={`data:image/jpeg;base64,${radarSnapshot.fmcw.insights.annotatedImageBase64}`}
                        alt="YOLO 오버레이"
                        className="radar-fmcw-synced__img"
                      />
                    ) : (
                      <div className="radar-fmcw-synced__placeholder muted">이미지 없음</div>
                    )}
                  </div>
                </div>
                {radarSnapshot.fmcw.insights.syncedViewNote ? (
                  <p className="radar-fmcw-synced-note">{radarSnapshot.fmcw.insights.syncedViewNote}</p>
                ) : null}

                <div className="radar-inline-viz radar-inline-viz--below-sync" aria-label="FMCW 2D 차트">
                  <div className="radar-inline-viz__block radar-inline-viz__block--2d radar-inline-viz__block--wide">
                    <p className="radar-inline-viz__heading">2D Range–Azimuth · 수평면 x–y</p>
                    <p className="muted radar-inline-viz__hint">
                      동일 프레임 탐지 목록. 색=도플러.
                    </p>
                    <RadarCharts2D detections={radarSnapshot.fmcw.detections} />
                  </div>
                </div>

                <section className="radar-fmcw-lidar-review" aria-label="LiDAR 검토">
                  <h3 className="radar-fmcw-lidar-review__title">LiDAR로의 검토</h3>
                  <p className="radar-fmcw-lidar-review__body">
                    {radarSnapshot.fmcw.insights.lidarReviewParagraph}
                  </p>
                  {radarSnapshot.fmcw.insights.lidarValidation &&
                    (radarSnapshot.fmcw.insights.lidarValidation.pointsInRoi ?? 0) > 0 && (
                      <ul className="radar-fmcw-lidar-review__stats muted">
                        <li>
                          ROI 점 수:{' '}
                          <strong>{radarSnapshot.fmcw.insights.lidarValidation.pointsInRoi}</strong>
                        </li>
                        <li>
                          Δ거리:{' '}
                          <strong>{radarSnapshot.fmcw.insights.lidarValidation.deltaRangeM ?? '—'} m</strong>
                        </li>
                        <li>
                          Δ방위:{' '}
                          <strong>{radarSnapshot.fmcw.insights.lidarValidation.deltaBearingDeg ?? '—'}°</strong>
                        </li>
                        <li>
                          판정:{' '}
                          <strong>{radarSnapshot.fmcw.insights.lidarValidation.verdict ?? '—'}</strong>
                        </li>
                      </ul>
                    )}
                </section>
              </>
                </div>
              </details>
            )}
            {radarSnapshot.fmcw.detections.length > 0 && !radarSnapshot.fmcw.insights && (
              <details className="fmcw-snapshot-details" open>
                <summary className="fmcw-snapshot-details__summary">Range–Azimuth 차트 (동기 요약 없음)</summary>
                <div className="fmcw-snapshot-details__body">
                  <div className="radar-inline-viz" aria-label="FMCW Range–Azimuth 시각화">
                    <div className="radar-inline-viz__block radar-inline-viz__block--2d radar-inline-viz__block--wide">
                      <p className="radar-inline-viz__heading">2D 산점도 (탐지 전체)</p>
                      <p className="muted radar-inline-viz__hint">
                        Range–Azimuth, 수평면 x–y(m). 색은 도플러(접근·이탈).
                      </p>
                      <RadarCharts2D detections={radarSnapshot.fmcw.detections} />
                    </div>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
        <div className="map-legend map-legend-tactical">
          <p className="map-legend-title">
            <strong>전술도 부호 (참조 차트 반영)</strong>
          </p>
          <ul className="map-legend-list">
            <li>
              <strong>아군</strong>: 사각형 안 — 보병 <em>X</em>, 포병 <em>점</em>, 기갑 <em>타원</em>, 기계화·정찰·공병·방공은 차트에 맞춘 단순화 기호.
              <strong> 실선</strong>=현재 지점, <strong>점선</strong>=예정 지점. 상단 틱 ≈ 증강(+)/감소(-).
            </li>
            <li>
              <strong>적군</strong>: <strong>이중 실선</strong> 사각형=적 부대, <strong>호(곡선)</strong> 강조=적 진지·화력점 등.
            </li>
            <li>하단 글자: <strong>소·중·대</strong> = 소대/중대/대대, 적은 <strong>적</strong> 표기.</li>
            <li>
              <strong>레이더</strong>: <strong>하늘 부채꼴·F·도플러 점</strong>=FMCW(약 10~15km, 타임라인 진행 구간),{' '}
              <strong>주황 점선</strong>=FMCW 예측 이동 경로.
            </li>
          </ul>
        </div>
        <p className="muted">
          마커는 <strong>CustomOverlay + SVG</strong>로 그립니다. DB의 <code>symbolType</code>, <code>locationStatus</code>, <code>enemySymbol</code> 필드와 연동됩니다.
          <strong> 마우스를 올리면</strong> 핀 옆에 요약 정보가 뜨고, <strong>적 핀 클릭 시</strong> 전차 집결 정찰 영상 팝업과{' '}
          <strong>UAV 출동</strong> 버튼이 표시됩니다. 아군 핀 클릭 시에는 상황·정찰 영상을 재생합니다.
        </p>
      </div>
      </>
      )}

      {mapVideoModal &&
        createPortal(
          <div
            className="map-video-modal-backdrop"
            role="presentation"
            onClick={() => setMapVideoModal(null)}
          >
            <div
              className="map-video-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="map-video-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="map-video-modal-head">
                <div>
                  <h2 id="map-video-modal-title" className="map-video-modal-title">
                    {mapVideoModal.title}
                  </h2>
                  {mapVideoModal.subtitle ? (
                    <p className="map-video-modal-sub muted">{mapVideoModal.subtitle}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="map-video-modal-close"
                  aria-label="닫기"
                  onClick={() => setMapVideoModal(null)}
                >
                  ×
                </button>
              </div>
              <div className="map-video-modal-body">
                {mapVideoModal.videoUrl ? (
                  <video
                    key={mapVideoModal.videoUrl}
                    className="map-video-modal-video"
                    src={mapVideoModal.videoUrl}
                    controls
                    autoPlay
                    playsInline
                  >
                    브라우저가 video 태그를 지원하지 않습니다.
                  </video>
                ) : (
                  <p className="map-video-modal-empty muted">등록된 영상 URL이 없습니다.</p>
                )}
              </div>
              {mapVideoModal.enemyIntelMode ? (
                <div className="map-video-modal-footer">
                  <button
                    type="button"
                    className="btn-primary map-video-modal-uav-btn"
                    disabled={scenarioStep !== 5 || uavLaunchStartProgress != null}
                    onClick={() => {
                      handleLaunchUavFromBattalion()
                      setMapVideoModal(null)
                    }}
                  >
                    UAV 출동
                  </button>
                  <p className="map-video-modal-footer-hint muted">
                    {scenarioStep !== 5
                      ? '시나리오 5단계(대대 전술)에서 UAV 출동이 활성화됩니다.'
                      : uavLaunchStartProgress != null
                        ? 'UAV가 이미 출동한 상태입니다.'
                        : '클릭 시 정찰 UAV가 출동하고 타임라인이 진행됩니다.'}
                  </p>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )}

      <div className="table-wrap" style={{ marginTop: '1rem' }}>
        <table className="dataset-table">
          <thead>
            <tr>
              <th>측</th>
              <th>전술 부호·표시</th>
              <th>명칭</th>
              <th>좌표(WGS84 · MGRS)</th>
              <th>장비·병력</th>
              <th>태세·위협</th>
            </tr>
          </thead>
          <tbody>
            {friendlyUnits.map((unit) => (
              <tr key={unit.id} className="table-row-friendly">
                <td>
                  <span className="table-badge table-badge-friendly">아군</span> {unit.level}
                </td>
                <td>
                  {TACTICAL_SYMBOL_LABEL[unit.symbolType]}
                  <br />
                  <span className="muted small-cell">
                    {LOCATION_STATUS_LABEL[unit.locationStatus]}
                    {STRENGTH_LABEL[unit.strengthModifier]
                      ? ` · ${STRENGTH_LABEL[unit.strengthModifier]}`
                      : ''}
                  </span>
                </td>
                <td>{unit.name}</td>
                <td>
                  {unit.lat.toFixed(3)}, {unit.lng.toFixed(3)}
                  <br />
                  <span className="muted small-cell">{latLngToMgrsSafe(unit.lat, unit.lng)}</span>
                </td>
                <td>
                  {unit.equipment}
                  <br />
                  <span className="muted small-cell">{unit.personnel}명</span>
                </td>
                <td>{unit.readiness}</td>
              </tr>
            ))}
            {enemyInfiltrations.map((enemy) => (
              <tr key={enemy.id} className="table-row-enemy">
                <td>
                  <span className="table-badge table-badge-enemy">적군</span>
                </td>
                <td>
                  {enemy.enemySymbol === 'ENEMY_STRONGPOINT' ? '적 진지(호형)' : '적 부대(이중선)'}
                  <br />
                  <span className="muted small-cell">{enemy.enemyBranch}</span>
                </td>
                <td>{enemy.codename}</td>
                <td>
                  {enemy.lat.toFixed(3)}, {enemy.lng.toFixed(3)}
                  <br />
                  <span className="muted small-cell">{latLngToMgrsSafe(enemy.lat, enemy.lng)}</span>
                </td>
                <td>
                  추정 {enemy.estimatedCount}명
                  <br />
                  <span className="muted small-cell">반경 {enemy.riskRadiusMeter}m</span>
                </td>
                <td>{enemy.threatLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function IdentificationTrackingPage() {
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [isSubmittingImage, setIsSubmittingImage] = useState(false)
  const [isSubmittingVideo, setIsSubmittingVideo] = useState(false)
  const [imageResult, setImageResult] = useState<YoloInferenceResponse | null>(null)
  const [videoResult, setVideoResult] = useState<YoloVideoInferenceResponse | null>(null)

  const handleSubmitImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setImageResult(null)

    if (!selectedImageFile) {
      setError('추론할 이미지를 먼저 선택해 주세요.')
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      setError('로그인 토큰이 없습니다. 다시 로그인해 주세요.')
      return
    }

    setIsSubmittingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedImageFile)

      const response = await fetch(`${getApiBaseUrl()}/ai/yolo/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = (await response.json().catch(() => ({}))) as YoloInferenceResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || 'YOLO 추론 요청에 실패했습니다.')
      }

      setImageResult(data)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'YOLO 추론 요청 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmittingImage(false)
    }
  }

  const handleSubmitVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setVideoResult(null)

    if (!selectedVideoFile) {
      setError('판별할 동영상 파일을 먼저 선택해 주세요.')
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      setError('로그인 토큰이 없습니다. 다시 로그인해 주세요.')
      return
    }

    setIsSubmittingVideo(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedVideoFile)

      const response = await fetch(`${getApiBaseUrl()}/ai/yolo/video`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = (await response.json().catch(() => ({}))) as YoloVideoInferenceResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || 'YOLO 동영상 추론 요청에 실패했습니다.')
      }

      setVideoResult(data)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'YOLO 동영상 추론 요청 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmittingVideo(false)
    }
  }

  return (
    <section className="page">
      <h1>전차 식별 및 추적</h1>
      <p className="muted">
        YOLO 검출·추적(파일 업로드). 드론 탑재 EO/IR 시나리오는{' '}
        <NavLink to="/drone-eo-ir">드론 EO/IR 식별</NavLink> · 카메라:{' '}
        <NavLink to="/monitor">모니터</NavLink>
      </p>

      <form className="form yolo-upload-form" onSubmit={handleSubmitImage}>
        <label>
          이미지 파일 선택
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setSelectedImageFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSubmittingImage}>
          {isSubmittingImage ? '추론 중...' : '이미지 추론 실행'}
        </button>
      </form>

      <form className="form yolo-upload-form" onSubmit={handleSubmitVideo}>
        <label>
          동영상 파일 선택
          <input
            type="file"
            accept="video/*"
            onChange={(event) => setSelectedVideoFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSubmittingVideo}>
          {isSubmittingVideo ? '동영상 분석 중...' : '동영상 판별 실행'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {imageResult && (
        <div className="yolo-result">
          <h3>이미지 추론 결과</h3>
          <p className="muted">입력 소스: {imageResult.source}</p>
          <p>
            검출 수: <strong>{imageResult.detections.length}</strong>
          </p>

          {imageResult.annotatedImageBase64 && (
            <img
              className="yolo-preview"
              src={`data:image/jpeg;base64,${imageResult.annotatedImageBase64}`}
              alt="YOLO annotated result"
            />
          )}

          <div className="table-wrap">
            <table className="dataset-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>라벨</th>
                  <th>신뢰도</th>
                  <th>트랙 ID</th>
                  <th>BBox</th>
                </tr>
              </thead>
              <tbody>
                {imageResult.detections.length > 0 ? (
                  imageResult.detections.map((item, index) => (
                    <tr key={`${item.label}-${index}`}>
                      <td>{index + 1}</td>
                      <td>{item.label}</td>
                      <td>{(item.confidence * 100).toFixed(1)}%</td>
                      <td>{item.trackId ?? '-'}</td>
                      <td>{item.bbox.map((v) => v.toFixed(1)).join(', ')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      검출된 객체가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {videoResult && (
        <div className="yolo-result">
          <h3>동영상 판별 결과</h3>
          <p className="muted">입력 소스: {videoResult.source}</p>
          <div className="video-summary-grid">
            <p>
              총 프레임: <strong>{videoResult.totalFrames.toLocaleString('ko-KR')}</strong>
            </p>
            <p>
              분석 프레임: <strong>{videoResult.sampledFrames.toLocaleString('ko-KR')}</strong>
            </p>
            <p>
              FPS: <strong>{videoResult.fps}</strong>
            </p>
            <p>
              총 검출 수: <strong>{videoResult.totalDetections.toLocaleString('ko-KR')}</strong>
            </p>
          </div>

          <h4>라벨별 검출 집계</h4>
          <div className="table-wrap">
            <table className="dataset-table">
              <thead>
                <tr>
                  <th>라벨</th>
                  <th>검출 수</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(videoResult.countsByLabel).length > 0 ? (
                  Object.entries(videoResult.countsByLabel).map(([label, count]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{count.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="empty-cell">
                      검출된 객체가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {videoResult.previewFramesBase64.length > 0 && (
            <>
              <h4>프레임 미리보기</h4>
              <div className="video-preview-grid">
                {videoResult.previewFramesBase64.map((frameBase64, index) => (
                  <img
                    key={`video-preview-${index}`}
                    className="yolo-preview"
                    src={`data:image/jpeg;base64,${frameBase64}`}
                    alt={`video preview ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** 시나리오 우측 「YOLO 기반 전차 판별」 고정 클립 (yolo_tank_temp2) */
const YOLO_TANK_CORNER_VIDEO_URL = '/media/yolo-tank-2.mp4'
/** 센서 파이프라인 4단계(드론 EO/IR) 등 데모 루프 (yolo_tank_temp) */
const DEMO_DRONE_VIDEO_URL = '/media/yolo-tank-3.mp4'

type SensorStepDef = {
  id: 'sat_sar' | 'uav_sar' | 'fmcw' | 'drone'
  title: string
  tag: string
  description: string
  technicalDetail: string
  scenarioDetail: string
  meta: { label: string; value: string }[]
}

/** 센서 파이프라인 개요 (홈 1~4단계 — 기획 1·2·3·4단계 핵심을 웹 흐름에 대응) */
const SENSOR_TECHNICAL_FLOW_OVERVIEW: string[] = [
  'Sentinel-1 IW·SLC/GRD, Burst 병합(위상 연속), Sub-Aperture 위상차로 기동 표적 분리, RCS·OSM 2차 필터.',
  'Spotlight·SARDet-100K·MSFA+R-CNN 계열로 전차/차량 이진 분류 후 좌표 유도; UAV에서 YOLO+ByteTrack·경로·EO/IR 융합.',
  'VoD FMCW(3+1D) 점군 DBSCAN·연속 프레임 추적, LiDAR·Camera 교차검증, 규칙 기반 위험도→AI 위험지역 예측 확장.',
  '근접 드론 YOLOv8n·SAHI·BoT-SORT, 레이더·영상 융합, Top-K·HITL UI로 정밀 기종 식별.',
]

const SENSOR_WEB_SCENARIO_OVERVIEW: string[] = [
  '1단계: 조기 경보(SAR)에 대응 — 광역 타일·변화·후보 AOI 시각화.',
  '2단계: 정밀 SAR·UAV — 궤적, EO/IR 패널, 다중 표적 ID·경로 개요.',
  '3단계: 레이더 인계·FMCW — 부채꼴, live 스냅샷(/map/radar/snapshot?source=live), 위험 예측 파이프.',
  '4단계·5단계(웹 C2): 통합 상황판 — 40/15 km, 정찰 영상, 이벤트·전술, 지휘결심 지원.',
]

const SENSOR_PIPELINE_STEPS: SensorStepDef[] = [
  {
    id: 'sat_sar',
    title: 'SAR 광역',
    tag: '조기 경보',
    description:
      'Sentinel-1 IW(Wide) 광역에서 대규모 기동 징후를 조기 포착하고, 정밀 자산 유도를 위한 후보를 산출합니다.',
    technicalDetail:
      '데이터: SLC(위상+진폭, 시분할 위상차)·GRD(진폭, RCS 대조). SNAP 기반 Burst 병합(Debursting)으로 위상 연속 단일 SLC. FFT 후 Sub-Aperture 분할·위상 간섭으로 정지 배경 제거·도플러 편이 픽셀 추출. RCS 임계 필터 후 OSM 도로·수역·지형과 공간 매칭해 최종 기동 후보 확정.',
    scenarioDetail:
      '웹 1단계: 전·후 SAR 타일·광역 지도로 기획서 ①조기 경보 파이프라인에 상응하는 상황 인지.',
    meta: [
      { label: '데이터 예', value: '이집트 선박·한국 차량·북한 전차(SLC/GRD 각 1)' },
      { label: '산출', value: '기동 후보 좌표·신뢰도' },
      { label: '다음', value: '고해상 SAR·UAV 유도' },
    ],
  },
  {
    id: 'uav_sar',
    title: 'UAV',
    tag: '정밀 SAR · 추적',
    description:
      '1단계 후보 좌표를 바탕으로 Spotlight 고해상 SAR에서 전차·차량을 구분하고, UAV로 실시간 추적·경로를 유지합니다.',
    technicalDetail:
      '학습: SARDet-100K(Spotlight), Tank·Car 집중. 백본 ResNet-152·R-CNN 계열+MSFA 융합, ImageNet·DOTA·WST 사전학습 가중치, 최종층 파인튜닝. 위기 시 이진 분류, 평시 주둔지 전차 박스 카운트. UAV: YOLO 검출+ByteTrack 다중 추적, 프레임 중심 좌표로 경로·집단 패턴, ARMA3 기반 EO/IR 시뮬 학습 데이터, IR 열 대비 반영.',
    scenarioDetail:
      '웹 2단계·통합: UAV 궤적·EO/IR 패널로 기획 ②고해상 SAR+MSFA 및 ③무인기 추적 흐름을 한 화면 흐름에 대응.',
    meta: [
      { label: '학습·검증', value: '공항·주거·산악 × EO/IR, 전차·차량 다양 조건' },
      { label: '산출', value: '트랙 ID·경로·EO/IR 클립' },
      { label: '다음', value: '레이더 구역 → FMCW' },
    ],
  },
  {
    id: 'fmcw',
    title: 'FMCW·VoD',
    tag: '레이더 인계',
    description:
      '표적이 레이더 감시 구역으로 진입하면 연속 추적을 이어받고, VoD FMCW로 근거리 탐지·위치·위험 예측을 수행합니다.',
    technicalDetail:
      '군용 레이더 대체로 VoD: Camera·Velodyne LiDAR·ZF FRGen21 FMCW(bin N×7: x,y,z,RCS,v_r…). DBSCAN 군집으로 후보 중심, 동일 프레임 LiDAR·영상 교차검증, 연속 프레임 매칭으로 속도·방향·진행 가능 영역·위험지역(규칙→weak label·시뮬 GT로 AI 확장). 웹: live API ?source=live.',
    scenarioDetail:
      '웹 3단계·통합: 부채꼴·탐지 차트·지도 오버레이로 기획 ④⑧ FMCW·위험 예측 및 레이더 인계에 대응.',
    meta: [
      { label: 'VoD 규모', value: '프레임 8,682+ / 3D 박스 123k+ 등' },
      { label: '산출', value: '탐지·트랙·위험 힌트' },
      { label: '다음', value: '근접 드론 EO/IR' },
    ],
  },
  {
    id: 'drone',
    title: '드론 EO/IR',
    tag: '정밀 식별',
    description:
      '근접에서 영상으로 기종을 세분하고, 레이더·영상을 융합하며 Top-K로 지휘관 HITL 결심을 지원합니다.',
    technicalDetail:
      '후보 9종 벤치 후 YOLOv8n 채택(mAP~0.793, ~4.23 ms). 라벨 무결·기초·Mosaic/Mixup 증강. 고고도 시 SAHI 슬라이싱 선택 활성화. BoT-SORT로 밀집·가림 시 ID 안정. 레이더 속도·패턴과 영상 분류 융합. UI: Top-K 클래스·신뢰도 표시.',
    scenarioDetail:
      '통합 상황: 정찰 영상 모달·핀·배너, 전술 추천과 연계. 기획 ④ 정밀 식별·⑥융합·⑦Top-K 및 드론 파이프.',
    meta: [
      { label: '산출', value: '기종·신뢰도·Top-K·궤적' },
      { label: '웹', value: 'EO/IR·HITL 뷰' },
      { label: '다음', value: '종합 상황판·전술' },
    ],
  },
]

/** 센서 파이프라인 «FMCW·VoD» 단계 — `/map/radar/snapshot?source=live` + 홈 3단계와 동일 계열 차트 */
function SensorPipelineRadarLivePanel() {
  const [snap, setSnap] = useState<RadarSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    void requestJson<RadarSnapshot>(`${getApiBaseUrl()}/map/radar/snapshot?source=live`)
      .then((s) => {
        if (!cancelled) setSnap(s)
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : '스냅샷 로드 실패')
          setSnap(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const live = snap?.fmcw.meta.liveRun

  if (loading) {
    return (
      <p className="muted sensor-radar-live">
        FMCW 스냅샷(<code>?source=live</code>) 연결 중…
      </p>
    )
  }
  if (err || !snap) {
    return (
      <div className="sensor-radar-live">
        <p className="error">FMCW 스냅샷을 불러오지 못했습니다. {err}</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          다시 시도
        </button>
      </div>
    )
  }

  const dets = snap.fmcw.detections
  const primaryId = dets[0]?.id

  return (
    <div className="sensor-radar-live">
      <div className="sensor-radar-live__toolbar">
        {live?.ok ? (
          <span className="sensor-radar-live__badge">
            실제 파이프라인 · {live.radarPipeline ?? 'AI'} · 프레임 {live.frameId ?? '—'} ·{' '}
            {live.inferMs ?? '—'} ms · 레이더 점 {live.radarPointCount ?? '—'}
          </span>
        ) : live && !live.ok ? (
          <span
            className="sensor-radar-live__badge sensor-radar-live__badge--warn"
            title={live.error}
          >
            live 실패 — 보조 탐지 표시
          </span>
        ) : (
          <span className="sensor-radar-live__badge sensor-radar-live__badge--warn">live 메타 없음</span>
        )}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          다른 프레임(재추론)
        </button>
      </div>
      <div className="sensor-radar-live__hero">
        <div className="sensor-radar-live__mini" aria-hidden>
          <div className="sensor-radar-wrap">
            <div className="sensor-radar-rings" />
            <div className="sensor-radar-sweep" />
            <div className="sensor-radar-blips">
              <span className="blip" style={{ top: '32%', left: '58%' }} />
              <span className="blip blip--dim" style={{ top: '48%', left: '44%' }} />
              <span className="blip" style={{ top: '62%', left: '52%' }} />
            </div>
          </div>
        </div>
        <div>
          {dets.length === 0 ? (
            <p className="muted">표시할 FMCW 탐지가 없습니다.</p>
          ) : (
            <div className="sensor-radar-live__charts">
              <div>
                <p className="sensor-radar-live__cap">Range–Azimuth · x–y</p>
                <p className="muted sensor-radar-live__hint">색=도플러 · live API · 2D 차트.</p>
                <RadarCharts2D detections={dets} />
              </div>
            </div>
          )}
        </div>
      </div>
      {dets.length > 0 && (
        <div className="sensor-radar-live__table-wrap">
          <table className="sensor-radar-live__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>거리(m)</th>
                <th>방위°</th>
                <th>도플러</th>
                <th>신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {dets.slice(0, 12).map((d) => (
                <tr
                  key={d.id}
                  className={d.id === primaryId ? 'sensor-radar-live__tr--primary' : undefined}
                >
                  <td>{d.id}</td>
                  <td>{d.rangeM}</td>
                  <td>{d.azimuthDeg.toFixed(1)}</td>
                  <td>{d.dopplerMps.toFixed(2)}</td>
                  <td>{d.confidence.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function sensorPipelineViewportBadge(stepId: SensorStepDef['id']): string {
  switch (stepId) {
    case 'sat_sar':
      return 'Sentinel-1 · Sub-Aperture · RCS/OSM'
    case 'uav_sar':
      return 'MSFA·SARDet / YOLO·ByteTrack·EOIR'
    case 'fmcw':
      return 'VoD FMCW live · DBSCAN·융합'
    case 'drone':
      return 'YOLOv8n·SAHI·BoT-SORT·Top-K'
    default:
      return '개요 뷰'
  }
}

function SensorPipelinePage() {
  const [searchParams] = useSearchParams()
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)

  useEffect(() => {
    const key = searchParams.get('step')
    const idx: Record<string, number> = {
      sat_sar: 0,
      uav_sar: 1,
      fmcw: 2,
      drone: 3,
    }
    if (key != null && idx[key] !== undefined) {
      setStepIndex(idx[key])
    }
  }, [searchParams])

  const step = SENSOR_PIPELINE_STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === SENSOR_PIPELINE_STEPS.length - 1

  useEffect(() => {
    if (!autoPlay) return undefined
    const t = window.setInterval(() => {
      setStepIndex((i) => (i + 1 >= SENSOR_PIPELINE_STEPS.length ? 0 : i + 1))
    }, 4500)
    return () => window.clearInterval(t)
  }, [autoPlay])

  return (
    <section className="page sensor-pipeline-page">
      <div className="sensor-pipeline-head">
        <div>
          <h1>센서 파이프라인</h1>
          <p className="muted">
            시스템 설계상 ①SAR 조기경보 ②고해상 SAR+MSFA ③UAV 추적 ④레이더·드론 정밀식별 ⑤웹 종합상황판을, 본 화면에서는{' '}
            <strong>SAR → UAV → FMCW·VoD → 드론(EO/IR)</strong> 네 구간으로 압축해 보여 줍니다(홈 시나리오 1~4와
            동일 순서). 단계 선택 시 왼쪽 개요 강조. URL <code>?step=</code> 직접 진입. 근접 식별 전용:{' '}
            <Link to="/drone-eo-ir">드론 EO/IR 식별</Link>.
          </p>
        </div>
        <label className="sensor-autoplay-toggle">
          <input
            type="checkbox"
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.target.checked)}
          />
          자동 순환 (4.5초)
        </label>
      </div>

      <div className="sensor-flow-overview-grid">
        <div className="sensor-flow-overview-card">
          <h2 className="sensor-flow-overview-title">기술 흐름</h2>
          <ol className="sensor-flow-overview-list">
            {SENSOR_TECHNICAL_FLOW_OVERVIEW.map((text, i) => (
              <li
                key={`tech-${i}`}
                className={i === stepIndex ? 'sensor-flow-overview-li--active' : undefined}
              >
                <span className="sensor-flow-overview-idx">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
        </div>
        <div className="sensor-flow-overview-card sensor-flow-overview-card--scenario">
          <h2 className="sensor-flow-overview-title">시나리오 흐름 (웹)</h2>
          <ol className="sensor-flow-overview-list">
            {SENSOR_WEB_SCENARIO_OVERVIEW.map((text, i) => (
              <li
                key={`web-${i}`}
                className={i === stepIndex ? 'sensor-flow-overview-li--active' : undefined}
              >
                <span className="sensor-flow-overview-idx">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="sensor-pipeline-layout">
        <ol className="sensor-step-rail" aria-label="센서 단계">
          {SENSOR_PIPELINE_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`sensor-step-btn${i === stepIndex ? ' sensor-step-btn--active' : ''}${i < stepIndex ? ' sensor-step-btn--done' : ''}`}
                onClick={() => setStepIndex(i)}
              >
                <span className="sensor-step-num">{i + 1}</span>
                <span className="sensor-step-text">
                  <span className="sensor-step-title">{s.title}</span>
                  <span className="sensor-step-tag">{s.tag}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="sensor-pipeline-main">
          <div className="sensor-viewport-card">
            <div className="sensor-viewport-label">
              <span>{step.title}</span>
              <span className="sensor-viewport-badge">{sensorPipelineViewportBadge(step.id)}</span>
            </div>

            {step.id === 'sat_sar' && (
              <div className="sensor-sar-plate sensor-sar-plate--sat" aria-hidden>
                <div className="sensor-sar-scene">
                  <div className="sensor-sar-ground">
                    <div className="sensor-sar-grid sensor-sar-grid--perspective" />
                    <div className="sensor-sar-hotspots sensor-sar-hotspots--wide">
                      <span style={{ top: '28%', left: '42%' }} />
                      <span style={{ top: '55%', left: '63%' }} />
                      <span style={{ top: '72%', left: '35%' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step.id === 'uav_sar' && (
              <div className="sensor-uav-viewport" aria-hidden>
                <div className="sensor-uav-viewport__terrain" />
                <div className="sensor-uav-viewport__scanlines" />
                <div className="sensor-uav-viewport__crosshair" />
                <div className="sensor-uav-viewport__target-box" />
                <div className="sensor-uav-viewport__corners" />
                <div className="sensor-uav-viewport__hud">
                  <span className="sensor-uav-viewport__hud-line">EO/IR</span>
                  <span className="sensor-uav-viewport__hud-line sensor-uav-viewport__hud-line--accent">
                    TGT LOCK
                  </span>
                  <span className="sensor-uav-viewport__hud-line">AZ 042° · EL −12°</span>
                </div>
              </div>
            )}
            {step.id === 'fmcw' && <SensorPipelineRadarLivePanel />}
            {step.id === 'drone' && (
              <div className="sensor-drone-stage">
                <video
                  className="sensor-drone-video"
                  src={DEMO_DRONE_VIDEO_URL}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                >
                  브라우저가 video를 지원하지 않습니다.
                </video>
                <div className="sensor-drone-stage__overlay" aria-hidden>
                  <div className="sensor-drone-stage__overlay-top">
                    <span className="sensor-drone-stage__rec" />
                    <span className="sensor-drone-stage__label">EO/IR 근접</span>
                  </div>
                  <span className="sensor-drone-stage__corners" />
                </div>
              </div>
            )}
          </div>

          <div className="sensor-detail-panel">
            <p className="sensor-detail-lead">{step.description}</p>
            <div className="sensor-detail-split">
              <div className="sensor-detail-block">
                <h3 className="sensor-detail-block-title">이 단계 — 기술</h3>
                <p className="sensor-detail-block-text">{step.technicalDetail}</p>
              </div>
              <div className="sensor-detail-block sensor-detail-block--scenario">
                <h3 className="sensor-detail-block-title">이 단계 — 웹</h3>
                <p className="sensor-detail-block-text">{step.scenarioDetail}</p>
              </div>
            </div>
            <dl className="sensor-meta-grid">
              {step.meta.map((m) => (
                <div key={m.label} className="sensor-meta-row">
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
            <div className="sensor-nav-buttons">
              <button
                type="button"
                className="btn-secondary"
                disabled={isFirst}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                ← 이전
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={isLast}
                onClick={() =>
                  setStepIndex((i) => Math.min(SENSOR_PIPELINE_STEPS.length - 1, i + 1))
                }
              >
                다음 →
              </button>
            </div>
            {step.id === 'drone' ? (
              <p className="muted sensor-pipeline-crosslinks">
                동일 단계를 전용 레이아웃으로 보려면{' '}
                <Link to="/drone-eo-ir">드론 EO/IR 식별</Link> 페이지로 이동하세요.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function CameraMonitorPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsStreaming(false)
  }, [])

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return
    }

    const all = await navigator.mediaDevices.enumerateDevices()
    const cameras = all
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `카메라 ${index + 1}`,
      }))
    setDevices(cameras)
  }, [])

  const startStream = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('현재 브라우저는 카메라 스트리밍을 지원하지 않습니다.')
      return
    }

    setIsConnecting(true)
    setError('')
    stopStream()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: 'environment' },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setIsStreaming(true)

      const trackDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? ''
      setSelectedDeviceId(trackDeviceId || deviceId || '')
      await loadDevices()
    } catch {
      setError('카메라 접근에 실패했습니다. 권한을 확인해 주세요.')
    } finally {
      setIsConnecting(false)
    }
  }, [loadDevices, stopStream])

  useEffect(() => {
    void startStream()

    return () => {
      stopStream()
    }
  }, [startStream, stopStream])

  return (
    <section className="page camera-page">
      <div className="section-head">
        <h1>실시간 카메라 모니터링</h1>
        <span className={isStreaming ? 'camera-status live' : 'camera-status offline'}>
          {isStreaming ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <p className="muted">브라우저 카메라를 지연 없이 실시간으로 모니터링합니다.</p>

      <div className="camera-toolbar">
        <select
          value={selectedDeviceId}
          onChange={(event) => {
            const nextDeviceId = event.target.value
            setSelectedDeviceId(nextDeviceId)
            void startStream(nextDeviceId)
          }}
          disabled={isConnecting || devices.length === 0}
        >
          <option value="">카메라 선택</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn-primary"
          onClick={() => void startStream(selectedDeviceId || undefined)}
          disabled={isConnecting}
        >
          {isConnecting ? '연결 중...' : '재연결'}
        </button>
        <button type="button" className="btn-secondary" onClick={stopStream}>
          중지
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="camera-video-wrap">
        <video ref={videoRef} autoPlay playsInline muted />
      </div>
    </section>
  )
}

function branchToServiceCategory(branch: string): ServiceAssetCategory | null {
  const normalized = branch
    .trim()
    .replaceAll(/\s+/g, '')
    .replaceAll('·', '')
    .replaceAll('ㆍ', '')
    .toUpperCase()
  if (normalized === '상위대대' || (normalized.includes('상위') && normalized.includes('대대'))) {
    return 'UPPER_COMMAND'
  }
  if (normalized === '대대') {
    return 'DIVISION'
  }
  if (
    normalized.includes('상급지휘소') ||
    normalized.includes('전방지휘소') ||
    (normalized.includes('연대') && normalized.includes('전방'))
  ) {
    return 'UPPER_COMMAND'
  }
  if (
    normalized.includes('대대지휘소') ||
    normalized.includes('사단본부') ||
    (normalized.includes('사단') && normalized.includes('지휘'))
  ) {
    return 'DIVISION'
  }
  if (normalized.includes('포병')) return 'ARTILLERY'
  if (normalized.includes('전차') || normalized.includes('기갑')) return 'ARMOR'
  if (normalized.includes('SAR') || normalized.includes('합성개구레이더')) return 'SAR'
  if (normalized.includes('FMCW') || normalized.includes('지상감시레이더')) return 'GROUND_RADAR'
  if (normalized.includes('UAV') || normalized.includes('무인항공기')) return 'UAV'
  if (normalized.includes('드론') || normalized.includes('소형무인기')) return 'DRONE'
  return null
}

function toMapSourceData(
  points: Array<{
    id: number
    name: string
    lat: number
    lng: number
    category: string
    relation?: string
    kind?: string
    status?: string
    speedKph?: number
    headingDeg?: number
    riskLevel?: string
    level?: string
    formation?: string
    elevationM?: number
    mgrs?: string
    unitCode?: string
    readiness?: string
    mission?: string
    situationVideoUrl?: string | null
    grdTankEstimate?: number
    grdRiskScore?: number
    scenario_label_multi?: string
    scenario_label_compact?: string
  }>,
): Parameters<GeoJSONSource['setData']>[0] {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lng, point.lat],
      },
      properties: {
        id: point.id,
        name: point.name,
        category: point.category,
        relation: point.relation ?? '',
        kind: point.kind ?? '',
        status: point.status ?? '',
        speedKph: point.speedKph ?? null,
        headingDeg: point.headingDeg ?? null,
        riskLevel: point.riskLevel ?? '',
        level: point.level ?? '',
        formation: point.formation ?? '',
        elevationM: point.elevationM ?? null,
        mgrs: point.mgrs ?? '',
        unitCode: resolveUnitCodeForGeoJsonPoint(point),
        readiness: point.readiness ?? '',
        mission: point.mission ?? '',
        situationVideoUrl: point.situationVideoUrl ?? null,
        lat: point.lat,
        lng: point.lng,
        grdTankEstimate: point.grdTankEstimate ?? null,
        grdRiskScore: point.grdRiskScore ?? null,
        ...(typeof point.scenario_label_multi === 'string'
          ? {
              scenario_label_multi: point.scenario_label_multi,
              scenario_label_compact: point.scenario_label_compact ?? point.scenario_label_multi,
            }
          : {}),
      },
    })),
  } as Parameters<GeoJSONSource['setData']>[0]
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderServiceAssetPopupHtml(asset: {
  name: string
  category: string
  lat: number
  lng: number
  unitCode?: string
  level?: string
  formation?: string
  elevationM?: number | null
  mgrs?: string
  readiness?: string
  mission?: string
}): string {
  const categoryLabel =
    SERVICE_CATEGORY_LABEL[asset.category as ServiceAssetCategory] ?? asset.category
  const elev =
    typeof asset.elevationM === 'number' ? `${asset.elevationM.toFixed(1)} m` : '-'
  return `
    <div class="service-asset-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(asset.name)}</h4>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>분류</dt><dd>${escapeHtml(categoryLabel)}</dd></div>
        <div class="service-asset-popup__row"><dt>식별번호</dt><dd class="service-asset-popup__mono">${escapeHtml(asset.unitCode ?? '-')}</dd></div>
        <div class="service-asset-popup__row"><dt>전술대형</dt><dd>${escapeHtml(asset.formation ?? '-')}</dd></div>
        <div class="service-asset-popup__row"><dt>제대</dt><dd>${escapeHtml(asset.level ?? '-')}</dd></div>
        <div class="service-asset-popup__row"><dt>표고</dt><dd>${elev}</dd></div>
        <div class="service-asset-popup__row"><dt>MGRS</dt><dd class="service-asset-popup__mono">${escapeHtml(asset.mgrs ?? '-')}</dd></div>
        <div class="service-asset-popup__row"><dt>WGS84</dt><dd class="service-asset-popup__mono">${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}</dd></div>
        <div class="service-asset-popup__row"><dt>준비태세</dt><dd>${escapeHtml(asset.readiness ?? '-')}</dd></div>
        <div class="service-asset-popup__row service-asset-popup__row--mission"><dt>임무</dt><dd>${escapeHtml(asset.mission ?? '-')}</dd></div>
      </dl>
    </div>
  `
}

function relationLabel(relation: ScenarioEntityRelation): '적' | '우군' | '중립' {
  if (relation === 'ENEMY') return '적'
  if (relation === 'ALLY') return '우군'
  return '중립'
}

function getTacticScoresForEnemy(enemy: ScenarioEntity): ScenarioTacticScore[] {
  if (enemy.riskLevel === '높음') {
    return [
      { name: '즉응 화력 차단', score: 91, rationale: '접근 속도·위협도가 모두 높아 즉응 타격 우선' },
      { name: '우회 차단 기동', score: 82, rationale: '예상 진입축 우회 차단에 적합' },
      { name: '감시 지속·교란', score: 66, rationale: '교전 전 추적 유지/교란은 보조 전술' },
    ]
  }
  if (enemy.riskLevel === '중간') {
    return [
      { name: '감시 지속·추적', score: 88, rationale: '위협이 가변적이므로 추적 유지가 가장 효율적' },
      { name: '선제 화력 경고사격', score: 74, rationale: '확인 타격 전 억제 효과 기대' },
      { name: '우회 차단 기동', score: 69, rationale: '차단 기동은 지형 조건에 따라 선택' },
    ]
  }
  return [
    { name: '감시 유지', score: 83, rationale: '저위협 표적은 감시 유지가 최적' },
    { name: '예비대 대기', score: 71, rationale: '타격보다는 예비대 대기 권장' },
    { name: '즉응 화력 차단', score: 52, rationale: '현재 위협 수준에서 우선순위 낮음' },
  ]
}

function renderGrdMotionPopupHtml(
  meta: { classLabel: string; probPercent: number },
  distKm: number | null,
  hasDispatchableUav: boolean,
  opts?: { motionId?: string },
): string {
  const idLine =
    opts?.motionId != null
      ? `<div class="service-asset-popup__row"><dt>후보 ID</dt><dd class="service-asset-popup__mono">${escapeHtml(opts.motionId)}</dd></div>`
      : ''
  const distLine =
    distKm != null
      ? `<div class="service-asset-popup__row"><dt>최근접 UAV</dt><dd>${distKm.toFixed(0)} km</dd></div>`
      : `<div class="service-asset-popup__row"><dt>최근접 UAV</dt><dd>가용 자산 없음(DB)</dd></div>`
  const gateLine = hasDispatchableUav
    ? '<div class="service-asset-popup__row"><dt>출동</dt><dd>지시 우선 출동 가능(거리/준비태세 무관)</dd></div>'
    : '<div class="service-asset-popup__row"><dt>출동</dt><dd>DB 자산 현황에 UAV가 없어 출동할 수 없습니다</dd></div>'
  return `
    <div class="service-asset-popup">
      <h4 class="service-asset-popup__title">GRD 이동 검출(변화 픽셀)</h4>
      <dl class="service-asset-popup__dl">
        ${idLine}
        <div class="service-asset-popup__row"><dt>분류·신뢰도</dt><dd>${escapeHtml(meta.classLabel)}: ${meta.probPercent}%</dd></div>
        ${distLine}
        ${gateLine}
      </dl>
    </div>
  `
}

function renderSarRouteMovementTooltipHtml(p: SarMovementRouteTooltipProps): string {
  const pct = (p.moveProbability * 100).toFixed(0)
  const target =
    p.targetUnit != null
      ? `<div class="service-asset-popup__row"><dt>도달 목표(아군)</dt><dd>${escapeHtml(p.targetUnit)}</dd></div>`
      : ''
  return `
    <div class="service-asset-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(p.name)}</h4>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>적 전차 수</dt><dd>약 ${p.tankCount}대</dd></div>
        <div class="service-asset-popup__row"><dt>이동 확률</dt><dd>${pct}%</dd></div>
        <div class="service-asset-popup__row"><dt>이동 방향</dt><dd>${escapeHtml(p.moveDirectionLabel)} (${p.moveHeadingDeg.toFixed(0)}°)</dd></div>
        ${target}
      </dl>
    </div>
  `
}

function renderSarZoneObservationTooltipHtml(input: {
  zoneName: string
  zoneNote?: string
  route: SarMovementRouteTooltipProps | null
}): string {
  const route = input.route
  const tankCountLine =
    route != null
      ? `<div class="service-asset-popup__row"><dt>적 전차 수</dt><dd>약 ${route.tankCount}대</dd></div>`
      : '<div class="service-asset-popup__row"><dt>적 전차 수</dt><dd>추정 데이터 없음</dd></div>'
  const probabilityLine =
    route != null
      ? `<div class="service-asset-popup__row"><dt>남하 확률</dt><dd>${(route.moveProbability * 100).toFixed(0)}%</dd></div>`
      : '<div class="service-asset-popup__row"><dt>남하 확률</dt><dd>계산중</dd></div>'
  const headingLine =
    route != null
      ? `<div class="service-asset-popup__row"><dt>이동 방향</dt><dd>${escapeHtml(route.moveDirectionLabel)} (${route.moveHeadingDeg.toFixed(0)}°)</dd></div>`
      : ''
  const targetLine =
    route?.targetUnit != null
      ? `<div class="service-asset-popup__row"><dt>도달 목표(아군)</dt><dd>${escapeHtml(route.targetUnit)}</dd></div>`
      : ''
  const noteLine =
    input.zoneNote != null && input.zoneNote.trim().length > 0
      ? `<p class="muted" style="margin:8px 0 0;font-size:12px;line-height:1.4;">${escapeHtml(input.zoneNote)}</p>`
      : ''
  return `
    <div class="service-asset-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(input.zoneName)}</h4>
      <dl class="service-asset-popup__dl">
        ${tankCountLine}
        ${probabilityLine}
        ${headingLine}
        ${targetLine}
      </dl>
      ${noteLine}
    </div>
  `
}

function scenarioEntityPopupElevationM(entity: ScenarioEntity): number {
  let h = 0
  const hashSeed = `${entity.id}:${entity.relation}:${entity.kind}`
  for (let i = 0; i < hashSeed.length; i += 1) h = (h * 31 + hashSeed.charCodeAt(i)) >>> 0
  const aff =
    entity.relation === 'ENEMY' ? 13 : entity.relation === 'ALLY' ? 11 : 17
  return syntheticElevationM(entity.lat, entity.lng, (h % 40000) + aff)
}

function headingToDirectionKo(headingDeg: number): string {
  const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] as const
  const normalized = ((headingDeg % 360) + 360) % 360
  const index = Math.round(normalized / 45) % dirs.length
  return dirs[index]!
}

function renderFmcwEstimatedEnemyPopupHtml(payload: {
  pointName: string
  targetName: string
  lat: number
  lng: number
  mgrs: string
  speedKph?: number
  headingDeg?: number
  riskLevel?: string
  ingressSummary: string
}): string {
  const headingLine =
    payload.headingDeg == null
      ? '계산 중'
      : `${headingToDirectionKo(payload.headingDeg)} (${payload.headingDeg.toFixed(0)}°)`
  const speedLine = payload.speedKph == null ? '계산 중' : `${payload.speedKph.toFixed(1)} km/h`
  return `
    <div class="service-asset-popup fmcw-risk-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(payload.pointName)}</h4>
      <p class="fmcw-risk-popup__zone">${escapeHtml(payload.targetName)}</p>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>점 객체 추정</dt><dd>FMCW 반사점 기반 추정</dd></div>
        <div class="service-asset-popup__row"><dt>좌표</dt><dd>${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}</dd></div>
        <div class="service-asset-popup__row"><dt>MGRS</dt><dd>${escapeHtml(payload.mgrs)}</dd></div>
        <div class="service-asset-popup__row"><dt>이동 방향</dt><dd>${escapeHtml(headingLine)}</dd></div>
        <div class="service-asset-popup__row"><dt>추정 속도</dt><dd>${escapeHtml(speedLine)}</dd></div>
        <div class="service-asset-popup__row"><dt>위험도</dt><dd>${escapeHtml(payload.riskLevel ?? '중간')}</dd></div>
        <div class="service-asset-popup__row"><dt>예상 경로</dt><dd>${escapeHtml(payload.ingressSummary)}</dd></div>
      </dl>
    </div>
  `
}

type ScenarioEntityPopupMode = 'summary' | 'full'

/** 지도 팝업 — `summary`: 요약만(호버), `full`: 적 클릭 시 드론·대응 전술 포함 */
function renderScenarioEntityPopupHtml(
  entity: ScenarioEntity,
  latOverride?: number,
  lngOverride?: number,
  popupMode: ScenarioEntityPopupMode = 'summary',
): string {
  const lat = latOverride ?? entity.lat
  const lng = lngOverride ?? entity.lng
  const elev = scenarioEntityPopupElevationM({ ...entity, lat, lng })
  const unitCode = buildScenarioEntityUnitCode(entity)
  const trackDigits = resolveScenarioEnemyTrackDigits({ ...entity, unitCode })
  const isEnemy = entity.relation === 'ENEMY'
  const popupTitle = isEnemy ? getEnemyDisplayName(entity.enemyCategory, entity.confidence) : entity.name
  const idRowLabel = isEnemy ? 'Track ID' : '식별번호'
  const idRowValue = isEnemy ? getTrackLabelLong(trackDigits) : unitCode
  const detectionRow = isEnemy
    ? `<div class="service-asset-popup__row"><dt>상태</dt><dd>${escapeHtml(
        getEnemyStatusLabel(entity.detectionStatus),
      )}</dd></div>`
    : ''
  const showEnemyActions = isEnemy && popupMode === 'full'
  const controlRows = showEnemyActions
    ? (() => {
          const tacticRows = getTacticScoresForEnemy(entity)
            .slice(0, 3)
            .map((row) => {
              const videoUrl = tacticVideoUrlForName(row.name)
              return `<button
                type="button"
                class="service-asset-popup__tactic-btn"
                data-popup-action="tactic-play"
                data-entity-id="${entity.id}"
                data-tactic-name="${escapeHtml(row.name)}"
                data-video-url="${escapeHtml(videoUrl)}"
              >${escapeHtml(row.name)}</button>`
            })
            .join('')

          return `
            <div class="service-asset-popup__controls service-asset-popup__controls--enemy-click">
              <button
                type="button"
                class="service-asset-popup__action-btn"
                data-popup-action="drone-dispatch"
                data-entity-id="${entity.id}"
              >
                드론 출동
              </button>
              <div class="service-asset-popup__tactic-block">
                <p class="service-asset-popup__tactic-title">대응 전술 선택 (복수 선택)</p>
                <div class="service-asset-popup__tactic-grid">${tacticRows}</div>
              </div>
            </div>
          `
        })()
    : ''
  return `
    <div class="service-asset-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(popupTitle)}</h4>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>분류</dt><dd>${relationLabel(entity.relation)}</dd></div>
        <div class="service-asset-popup__row"><dt>${idRowLabel}</dt><dd class="service-asset-popup__mono">${escapeHtml(
          idRowValue,
        )}</dd></div>
        <div class="service-asset-popup__row"><dt>유형</dt><dd>${escapeHtml(entity.kind)}</dd></div>
        ${detectionRow}
        <div class="service-asset-popup__row"><dt>관측 요약</dt><dd>${escapeHtml(entity.status)}</dd></div>
        <div class="service-asset-popup__row"><dt>속도</dt><dd>${entity.speedKph.toFixed(1)} km/h</dd></div>
        <div class="service-asset-popup__row"><dt>방향</dt><dd>${entity.headingDeg.toFixed(1)}°</dd></div>
        <div class="service-asset-popup__row"><dt>위협도</dt><dd>${entity.riskLevel}</dd></div>
        <div class="service-asset-popup__row"><dt>표고</dt><dd>${elev} m</dd></div>
        ${
          isEnemy && entity.name.trim().length > 0
            ? `<div class="service-asset-popup__row"><dt>위치 메모</dt><dd>${escapeHtml(entity.name)}</dd></div>`
            : ''
        }
        ${
          entity.grdTankEstimate != null
            ? `<div class="service-asset-popup__row"><dt>전차</dt><dd>${entity.grdTankEstimate}대</dd></div>`
            : ''
        }
        ${
          entity.grdRiskScore != null
            ? `<div class="service-asset-popup__row"><dt>위험도</dt><dd>${entity.grdRiskScore}</dd></div>`
            : ''
        }
      </dl>
      ${controlRows}
    </div>
  `
}

function buildFallbackPath(baseLat: number, baseLng: number): Array<{ lat: number; lng: number }> {
  return [
    { lat: baseLat - 0.04, lng: baseLng - 0.05 },
    { lat: baseLat - 0.015, lng: baseLng + 0.03 },
    { lat: baseLat + 0.03, lng: baseLng + 0.07 },
    { lat: baseLat + 0.05, lng: baseLng + 0.015 },
    { lat: baseLat + 0.015, lng: baseLng - 0.06 },
  ]
}

type SensorSimProceedCtx = {
  grdFocusId: string | null
  grdEligible: boolean
  /** SAR 단계에서 적 MBT 선택 + DB UAV 자산 존재 시 UAV 진행 허용 */
  sarEnemyUavEligible: boolean
  droneStrikeTarget: { lat: number; lng: number; name: string } | null
}

/** 센서 시뮬레이션 「진행」 버튼 활성 여부 — 지도 클릭만으로는 단계가 바뀌지 않게 맞춤 */
function getSensorSimulationProceedState(
  sensorId: ServiceSensorId,
  phase: BattlefieldScenarioPhase,
  ctx: SensorSimProceedCtx,
): { canProceed: boolean; hint?: string } {
  if (phase === BattlefieldScenarioPhase.SCENARIO_COMPLETE) {
    return {
      canProceed: false,
      hint: '시뮬레이션이 완료되었습니다. 처음부터 다시 하려면 시나리오 초기화를 누르세요.',
    }
  }
  if (phase === BattlefieldScenarioPhase.IDLE) {
    return {
      canProceed: false,
      hint: '먼저 지도에서 한반도 작전 구역을 클릭해 구역을 확정하세요. 확정 후에만 센서 시뮬레이션을 진행할 수 있습니다.',
    }
  }
  if (phase === BattlefieldScenarioPhase.REGION_SELECTED) {
    if (sensorId === 'sar') return { canProceed: true }
    return {
      canProceed: false,
      hint: '이 단계에서는 SAR 시뮬레이션만 시작할 수 있습니다. UAV·드론·FMCW는 SAR 이후 순서대로 진행됩니다.',
    }
  }
  if (phase === BattlefieldScenarioPhase.SAR_SCAN) {
    if (sensorId === 'sar') return { canProceed: true }
    if (sensorId === 'uav') {
      if (ctx.sarEnemyUavEligible || (ctx.grdFocusId && ctx.grdEligible)) {
        return { canProceed: true }
      }
      return {
        canProceed: false,
        hint: '파란 GRD를 가리키거나 적 전차(MBT)를 선택한 뒤, DB 자산 현황에 UAV가 1개 이상 있어야 UAV 시뮬레이션을 진행할 수 있습니다.',
      }
    }
    return {
      canProceed: false,
      hint: '현재 SAR 전개 단계입니다. 다음 순서는 UAV(GRD·거점 조건 충족 시)입니다.',
    }
  }
  if (phase === BattlefieldScenarioPhase.UAV_DISPATCHED) {
    if (sensorId === 'uav') return { canProceed: true }
    if (sensorId === 'drone') {
      if (!ctx.droneStrikeTarget) {
        return {
          canProceed: false,
          hint: '지도에서 적 표적을 먼저 선택한 뒤 드론 근접 시뮬레이션을 진행할 수 있습니다.',
        }
      }
      return { canProceed: true }
    }
    return {
      canProceed: false,
      hint: 'UAV 출동 단계입니다. 드론 근접은 적 표적 선택 후, 또는 UAV 궤적 재생을 이어갈 수 있습니다.',
    }
  }
  if (phase === BattlefieldScenarioPhase.DRONE_RECON) {
    if (sensorId === 'drone') return { canProceed: true }
    if (sensorId === 'fmcw') return { canProceed: true }
    return {
      canProceed: false,
      hint: '드론 근접 단계입니다. 다음은 FMCW 분석 시뮬레이션입니다.',
    }
  }
  if (phase === BattlefieldScenarioPhase.FMCW_ANALYSIS) {
    if (sensorId === 'fmcw') return { canProceed: true }
    return {
      canProceed: false,
      hint: 'FMCW 분석 단계입니다. 같은 버튼으로 연출을 이어갈 수 있습니다.',
    }
  }
  return { canProceed: false, hint: '현재 단계에서 이 센서로는 진행할 수 없습니다.' }
}

function BattlefieldServicePage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  /** 적 클릭으로 연 MapLibre 팝업(대응 전술) — 호버로 지우지 않음 */
  const enemyScenarioPopupPinnedRef = useRef(false)
  const sarLossNoticePopupRef = useRef<maplibregl.Popup | null>(null)
  const sarLossNoticeStartTimerRef = useRef<number | null>(null)
  const sarLossNoticeTimerRef = useRef<number | null>(null)
  const [assets, setAssets] = useState<ServiceAssetPoint[]>([])
  const [uavDispatchAssets, setUavDispatchAssets] = useState<UavDispatchAsset[]>([])
  const [droneDispatchAssets, setDroneDispatchAssets] = useState<UavDispatchAsset[]>([])
  const [assetLoading, setAssetLoading] = useState(true)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<ServiceAssetCategory | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const setSelectedAssetIdRef = useRef(setSelectedAssetId)
  setSelectedAssetIdRef.current = setSelectedAssetId
  const [sensorState, setSensorState] = useState<ServiceSensorState>(INITIAL_SENSOR_STATE)
  const [scenarioPhase, setScenarioPhase] = useState<BattlefieldScenarioPhase>(
    BattlefieldScenarioPhase.IDLE,
  )
  const [battlefieldSpeedIdx, setBattlefieldSpeedIdx] = useState(0)
  const [simulationPaused, setSimulationPaused] = useState(false)
  const [timelineCursor, setTimelineCursor] = useState(0)
  const [timelineLength, setTimelineLength] = useState(0)
  const [sarSpotlightSeen, setSarSpotlightSeen] = useState(false)
  const battlefieldSpeedMultiplier = BATTLEFIELD_SPEED_OPTIONS[battlefieldSpeedIdx] ?? 1
  const scenarioPhaseRef = useRef(scenarioPhase)
  scenarioPhaseRef.current = scenarioPhase
  const sensorStateRef = useRef(sensorState)
  sensorStateRef.current = sensorState

  /** 시나리오 적 MBT만 런타임 좌표 오버라이드(SAR에서 순항, UAV 단계에서 사거리 내 배치) */
  const [enemyBattlefieldPoses, setEnemyBattlefieldPoses] = useState<
    Record<number, { lat: number; lng: number }>
  >({})
  const enemyBattlefieldPosesRef = useRef(enemyBattlefieldPoses)
  enemyBattlefieldPosesRef.current = enemyBattlefieldPoses

  const scenarioEntitiesResolved = useMemo(
    () =>
      DUMMY_SCENARIO_ENTITIES.map((e) => {
        const p = enemyBattlefieldPoses[e.id]
        return p ? { ...e, lat: p.lat, lng: p.lng } : e
      }),
    [enemyBattlefieldPoses],
  )
  const scenarioEntitiesResolvedRef = useRef(scenarioEntitiesResolved)
  scenarioEntitiesResolvedRef.current = scenarioEntitiesResolved

  const [selectedDetail, setSelectedDetail] = useState<SelectedObjectDetail | null>(null)
  const setSelectedDetailRef = useRef(setSelectedDetail)
  setSelectedDetailRef.current = setSelectedDetail
  /** 드론 근접 시 추적할 지도상 적 표적(적 클릭으로 설정) */
  const [droneStrikeTarget, setDroneStrikeTarget] = useState<{
    lat: number
    lng: number
    name: string
  } | null>(null)
  const droneStrikeTargetRef = useRef(droneStrikeTarget)
  droneStrikeTargetRef.current = droneStrikeTarget
  /** 지도에서 선택한 적 MBT id — 드론 궤적 종점이 매 프레임 해당 핀 좌표를 따라감 */
  const [droneStrikeEntityId, setDroneStrikeEntityId] = useState<number | null>(null)
  const droneStrikeEntityIdRef = useRef<number | null>(droneStrikeEntityId)
  droneStrikeEntityIdRef.current = droneStrikeEntityId

  /** 작전 구역 확정 시 증가 → OSRM 남하 경로 재요청 */
  const [enemyMarchSession, setEnemyMarchSession] = useState(0)
  const enemyMarchRoutesRef = useRef<Record<number, MarchPoint[]>>({})
  const enemyMarchCumRef = useRef<Record<number, number[]>>({})
  const enemyMarchAlongMRef = useRef<Record<number, number>>({})
  const enemyTrackHistoryRef = useRef<Record<number, MarchPoint[]>>({})
  const timelineSnapshotsRef = useRef<SimulationTimelineSnapshot[]>([])
  const timelineCursorRef = useRef(0)
  timelineCursorRef.current = timelineCursor
  const timelineApplyingRef = useRef(false)

  const [tacticScores, setTacticScores] = useState<ScenarioTacticScore[] | null>(null)
  const setTacticScoresRef = useRef(setTacticScores)
  setTacticScoresRef.current = setTacticScores
  const [scenarioNotice, setScenarioNotice] = useState<string | null>(null)
  const [, setSarZoneProbabilities] = useState<ReadonlyArray<SarPassProbability> | null>(null)
  const [sarSpotlightOpen, setSarSpotlightOpen] = useState(false)
  const sarSpotlightOpenRef = useRef(false)
  sarSpotlightOpenRef.current = sarSpotlightOpen
  const dismissSarSpotlight = useCallback(() => {
    setSarSpotlightSeen(true)
    setSarSpotlightEmphasis(false)
    setSarSpotlightOpen(false)
  }, [])

  const [scenarioSummaryOpen, setScenarioSummaryOpen] = useState(false)
  const scenarioSummaryTitleId = useId()
  const sensorSimModalTitleId = useId()
  const fmcwSummaryModalTitleId = useId()
  const grdMotionAlertTitleId = useId()
  const uavDispatchModalTitleId = useId()
  const uavVideoModalTitleId = useId()
  const assetStreamModalTitleId = useId()
  const sarGrdVizModalTitleId = useId()
  const sarGrdMapToggleLabelId = useId()
  const fmcwCoverageToggleLabelId = useId()
  const fmcwRouteToggleLabelId = useId()
  const fmcwRiskToggleLabelId = useId()
  const [sensorSimModalSensor, setSensorSimModalSensor] = useState<ServiceSensorId | null>(null)
  const [fmcwSummaryModalOpen, setFmcwSummaryModalOpen] = useState(false)
  const [fmcwCoverageOn, setFmcwCoverageOn] = useState(true)
  const [fmcwPredictionRouteOn, setFmcwPredictionRouteOn] = useState(true)
  const [fmcwPredictionRiskOn, setFmcwPredictionRiskOn] = useState(true)
  const [fmcwSummarySection, setFmcwSummarySection] = useState<'point' | 'axis' | 'risk'>('point')
  const [fmcwBevRadarId, setFmcwBevRadarId] = useState<number>(GROUND_RADAR_SITES[0]?.id ?? 97001)
  const [sarGrdVizModalOpen, setSarGrdVizModalOpen] = useState(false)
  const [uavDispatchModalOpen, setUavDispatchModalOpen] = useState(false)
  const [uavDispatchRequest, setUavDispatchRequest] = useState<UavDispatchTarget | null>(null)
  const [selectedUavDispatchId, setSelectedUavDispatchId] = useState<number | null>(null)
  const [enemyDispatchPanelMode, setEnemyDispatchPanelMode] = useState<'dispatch' | 'tactic'>('dispatch')
  const [selectedEnemyTacticNames, setSelectedEnemyTacticNames] = useState<string[]>([])
  const [activeDispatchedUav, setActiveDispatchedUav] = useState<UavDispatchCandidate | null>(null)
  const [activeDispatchedDroneId, setActiveDispatchedDroneId] = useState<number | null>(null)
  const [activeUavDispatchTarget, setActiveUavDispatchTarget] = useState<UavDispatchTarget | null>(null)
  const [uavVideoModal, setUavVideoModal] = useState<{
    title: string
    subtitle?: string
    videoUrl: string | null
  } | null>(null)
  const [assetStreamModal, setAssetStreamModal] = useState<{
    sensor: 'uav' | 'drone'
    selectedAssetId: number | null
  } | null>(null)
  const [droneInlineVideoPanel, setDroneInlineVideoPanel] = useState<{
    assetId: number
    title: string
    videoUrl: string
  } | null>(null)
  const { riskState, updateRiskState } = useRiskFilters()
  const [selectedRiskCandidateId, setSelectedRiskCandidateId] = useState<string | null>(null)
  const { rankedCandidates, topCandidates, displayCandidates, summary: riskSummary } = useTopRiskCandidates(
    RISK_ZONE_E2E_MOCK,
    riskState,
  )
  const selectedRiskCandidate = useMemo(
    () => rankedCandidates.find((row) => row.id === selectedRiskCandidateId) ?? null,
    [rankedCandidates, selectedRiskCandidateId],
  )
  const riskGeoJson = useRiskGeoJson(
    displayCandidates,
    topCandidates,
    selectedRiskCandidateId,
    riskState.showSuppressionStage,
  )
  const activeDispatchedUavRef = useRef(activeDispatchedUav)
  activeDispatchedUavRef.current = activeDispatchedUav
  const uavHomeByIdRef = useRef<Record<number, { lat: number; lng: number }>>({})
  const droneHomeByIdRef = useRef<Record<number, { lat: number; lng: number }>>({})
  const uavReturnToBaseRef = useRef<{ lat: number; lng: number } | null>(null)
  const droneReturnToBaseRef = useRef<{ lat: number; lng: number } | null>(null)
  /** 지도 파란 GRD(이동 검출) 면·선 레이어 — SAR 버튼 팝업에서 토글 */
  const [grdMotionMapOverlayOn, setGrdMotionMapOverlayOn] = useState(false)

  const [sarSpotlightEmphasis, setSarSpotlightEmphasis] = useState(false)

  const [baseMapPreset, setBaseMapPreset] = useState<GoogleBasePresetId>('hybrid')
  const [rasterTuning, setRasterTuning] = useState<MapRasterTuning>(DEFAULT_MAP_RASTER_TUNING)
  const [mapReady, setMapReady] = useState(false)
  const [cursorReadout, setCursorReadout] = useState<{ lat: number; lng: number; mgrs: string } | null>(null)
  const [layerVisible, setLayerVisible] = useState<Record<LayerToggleKey, boolean>>(() => ({
    ...DEFAULT_LAYER_VISIBLE,
  }))
  const handleSelectRiskCandidate = useCallback(
    (candidateId: string) => {
      setSelectedRiskCandidateId(candidateId)
      const picked = rankedCandidates.find((row) => row.id === candidateId)
      const map = mapRef.current
      if (!picked || !map) return
      map.easeTo({
        center: [picked.lng, picked.lat],
        zoom: Math.max(map.getZoom(), 8.6),
        duration: 450,
      })
    },
    [rankedCandidates],
  )

  useEffect(() => {
    if (rankedCandidates.length === 0) {
      if (selectedRiskCandidateId != null) setSelectedRiskCandidateId(null)
      return
    }
    if (selectedRiskCandidateId == null) {
      setSelectedRiskCandidateId(rankedCandidates[0]!.id)
      return
    }
    const exists = rankedCandidates.some((row) => row.id === selectedRiskCandidateId)
    if (!exists) {
      setSelectedRiskCandidateId(rankedCandidates[0]!.id)
    }
  }, [rankedCandidates, selectedRiskCandidateId])

  const [grdHoverId, setGrdHoverId] = useState<string | null>(null)
  const [grdSelectedId, setGrdSelectedId] = useState<string | null>(null)
  const [grdEnemyMotionAlert, setGrdEnemyMotionAlert] = useState<{
    motionId: string
    enemyId: number
    enemyName: string
  } | null>(null)
  const enemyPrevInsideGrdRef = useRef<Record<number, Set<string>>>({})
  const grdOverlayActivePrevRef = useRef(false)
  const setGrdSelectedIdRef = useRef<(id: string | null) => void>(() => {})
  setGrdSelectedIdRef.current = setGrdSelectedId
  const assetsRef = useRef(assets)
  assetsRef.current = assets
  const uavDispatchAssetsRef = useRef(uavDispatchAssets)
  uavDispatchAssetsRef.current = uavDispatchAssets
  const grdDispatchGateRef = useRef<{ focusId: string | null; eligible: boolean }>({
    focusId: null,
    eligible: false,
  })

  /** UAV 출동 후 동적 위치(GRD 목표 또는 적 추적) — 정적 asset 궤적 인덱스와 별도 */
  const [uavSimPos, setUavSimPos] = useState<{ lat: number; lng: number } | null>(null)
  const uavSimPosRef = useRef<{ lat: number; lng: number } | null>(null)
  uavSimPosRef.current = uavSimPos
  const uavGrdMissionRef = useRef<{ centerLat: number; centerLng: number } | null>(null)
  const uavChasingEnemyIdRef = useRef<number | null>(null)
  /** 드론도 UAV와 같은 목표/추적 기반 이동 */
  const [droneSimPos, setDroneSimPos] = useState<{ lat: number; lng: number } | null>(null)
  const droneSimPosRef = useRef<{ lat: number; lng: number } | null>(null)
  droneSimPosRef.current = droneSimPos
  const droneMissionRef = useRef<{ centerLat: number; centerLng: number } | null>(null)
  const droneChasingEnemyIdRef = useRef<number | null>(null)
  /** SAR에서 적 MBT 선택 후 UAV 출동 시 GRD 게이트 대신 이 페이로드로 미션·추적 id 설정 */
  const sarEnemyUavBypassPayloadRef = useRef<{
    centerLat: number
    centerLng: number
    enemyId: number | null
  } | null>(null)
  const pendingUavDispatchRef = useRef<UavDispatchCandidate | null>(null)
  const pendingUavDispatchTargetRef = useRef<UavDispatchTarget | null>(null)

  const closeUavDispatchModal = useCallback(() => {
    setUavDispatchModalOpen(false)
    setUavDispatchRequest(null)
    setSelectedUavDispatchId(null)
    setEnemyDispatchPanelMode('dispatch')
    setSelectedEnemyTacticNames([])
  }, [])

  const openUavVideoModal = useCallback(
    (payload: { title: string; subtitle?: string; videoUrl: string | null }) => {
      setUavVideoModal(payload)
    },
    [],
  )

  const openAssetStreamModal = useCallback((sensor: 'uav' | 'drone') => {
    const category: ServiceAssetCategory = sensor === 'uav' ? 'UAV' : 'DRONE'
    const pool = assetsRef.current.filter((asset) => asset.category === category)
    const defaultId =
      sensor === 'uav'
        ? (activeDispatchedUavRef.current?.id ?? pool[0]?.id ?? null)
        : (pool[0]?.id ?? null)
    setAssetStreamModal({ sensor, selectedAssetId: defaultId })
  }, [])

  const launchDroneFromEnemyClick = useCallback(
    (target: { id: number; kind: string; name: string; lat: number; lng: number }) => {
      if (target.kind !== 'MBT') return
      setDroneStrikeTarget({ lat: target.lat, lng: target.lng, name: target.name })
      setDroneStrikeEntityId(target.id)
      droneMissionRef.current = { centerLat: target.lat, centerLng: target.lng }
      droneChasingEnemyIdRef.current = target.id
      const droneAsset =
        assetsRef.current.find((asset) => asset.category === 'DRONE') ??
        assetsRef.current.find((asset) => asset.category === 'UAV')
      const start = droneAsset
        ? { lat: droneAsset.lat, lng: droneAsset.lng }
        : { lat: GRD_FALLBACK_SAR_UAV_ORIGIN.lat, lng: GRD_FALLBACK_SAR_UAV_ORIGIN.lng }
      droneReturnToBaseRef.current = null
      setActiveDispatchedDroneId(droneAsset?.id ?? null)
      setDroneSimPos(start)
      setSensorState((prev) => ({
        ...prev,
        drone: { ...prev.drone, running: true },
      }))
      setScenarioNotice(`적 표적 클릭: ${target.name} 방향으로 드론을 즉시 출동시켰습니다.`)
    },
    [],
  )

  const uavDispatchCandidates = useMemo(
    () =>
      uavDispatchRequest == null
        ? []
        : buildUavDispatchCandidates(
            uavDispatchRequest.kind === 'enemy' ? droneDispatchAssets : uavDispatchAssets,
            uavDispatchRequest,
          ),
    [droneDispatchAssets, uavDispatchAssets, uavDispatchRequest],
  )
  const dispatchAssetLabel = uavDispatchRequest?.kind === 'enemy' ? '드론' : 'UAV'
  const recommendedUavDispatch = uavDispatchCandidates[0] ?? null
  const selectedUavDispatchCandidate =
    uavDispatchCandidates.find((candidate) => candidate.id === selectedUavDispatchId) ??
    recommendedUavDispatch
  const enemyDispatchTargetEntity = useMemo(() => {
    if (uavDispatchRequest?.kind !== 'enemy') return null
    if (uavDispatchRequest.enemyId != null) {
      return (
        scenarioEntitiesResolved.find((entity) => entity.id === uavDispatchRequest.enemyId) ?? null
      )
    }
    return null
  }, [scenarioEntitiesResolved, uavDispatchRequest])
  const enemyDispatchTacticRows = useMemo(
    () => (enemyDispatchTargetEntity ? getTacticScoresForEnemy(enemyDispatchTargetEntity) : []),
    [enemyDispatchTargetEntity],
  )
  const enemyDispatchHasTacticMode =
    uavDispatchRequest?.kind === 'enemy' && enemyDispatchTacticRows.length > 0
  const enemyDispatchActiveMode = enemyDispatchHasTacticMode ? enemyDispatchPanelMode : 'dispatch'

  const activeUavDispatchTargetText = useMemo(() => {
    if (!activeUavDispatchTarget) return null
    if (activeUavDispatchTarget.kind === 'enemy') {
      const name = activeUavDispatchTarget.enemyName ?? activeUavDispatchTarget.title
      return `${name} 방향`
    }
    if (activeUavDispatchTarget.motionId) {
      return `GRD ${activeUavDispatchTarget.motionId} 방향`
    }
    return `${activeUavDispatchTarget.lat.toFixed(4)}, ${activeUavDispatchTarget.lng.toFixed(4)} 방향`
  }, [activeUavDispatchTarget])

  const assetStreamCandidates = useMemo(() => {
    if (!assetStreamModal) return []
    const category: ServiceAssetCategory = assetStreamModal.sensor === 'uav' ? 'UAV' : 'DRONE'
    const fallbackUrls =
      assetStreamModal.sensor === 'uav'
        ? UAV_ASSET_STREAM_FALLBACK_VIDEO_URLS
        : DRONE_ASSET_STREAM_FALLBACK_VIDEO_URLS
    return assets
      .filter((asset) => asset.category === category)
      .map((asset, index) => ({
        ...asset,
        streamVideoUrl:
          asset.situationVideoUrl && asset.situationVideoUrl.trim().length > 0
            ? asset.situationVideoUrl
            : fallbackUrls[index % fallbackUrls.length] ?? null,
      }))
  }, [assetStreamModal, assets])

  const selectedAssetStream = useMemo(() => {
    if (!assetStreamModal) return null
    return (
      assetStreamCandidates.find((asset) => asset.id === assetStreamModal.selectedAssetId) ??
      assetStreamCandidates[0] ??
      null
    )
  }, [assetStreamCandidates, assetStreamModal])

  useEffect(() => {
    if (!uavDispatchModalOpen) return
    if (
      selectedUavDispatchId != null &&
      uavDispatchCandidates.some((candidate) => candidate.id === selectedUavDispatchId)
    ) {
      return
    }
    const fallback = uavDispatchCandidates[0] ?? null
    setSelectedUavDispatchId(fallback?.id ?? null)
  }, [uavDispatchCandidates, uavDispatchModalOpen, selectedUavDispatchId])

  useEffect(() => {
    if (!uavDispatchModalOpen || uavDispatchRequest?.kind !== 'enemy') return
    const availableNames = enemyDispatchTacticRows.map((row) => row.name)
    setSelectedEnemyTacticNames((prev) => {
      const keep = prev.filter((name) => availableNames.includes(name))
      if (keep.length > 0) return keep
      return availableNames.slice(0, 2)
    })
  }, [enemyDispatchTacticRows, uavDispatchModalOpen, uavDispatchRequest])

  useEffect(() => {
    if (!assetStreamModal) return
    if (assetStreamCandidates.length === 0) return
    const keep = assetStreamCandidates.some((asset) => asset.id === assetStreamModal.selectedAssetId)
    if (keep) return
    setAssetStreamModal((prev) =>
      prev == null ? prev : { ...prev, selectedAssetId: assetStreamCandidates[0]!.id },
    )
  }, [assetStreamCandidates, assetStreamModal])

  const grdFocusId = grdHoverId ?? grdSelectedId
  const grdDispatchEligible = useMemo(() => {
    if (!grdFocusId) return false
    if (!GRD_MOTION_META[grdFocusId]) return false
    return uavDispatchAssets.length > 0
  }, [grdFocusId, uavDispatchAssets])

  grdDispatchGateRef.current = { focusId: grdFocusId, eligible: grdDispatchEligible }

  const sarEnemyUavDispatchEligible = useMemo(() => {
    if (scenarioPhase !== BattlefieldScenarioPhase.SAR_SCAN) return false
    if (droneStrikeEntityId == null || droneStrikeTarget == null) return false
    return droneDispatchAssets.length > 0
  }, [scenarioPhase, droneDispatchAssets, droneStrikeEntityId, droneStrikeTarget])

  const openUavDispatchModal = useCallback(
    (request: UavDispatchTarget) => {
      setSensorSimModalSensor(null)
      setUavDispatchRequest(request)
      setSelectedUavDispatchId(null)
      setEnemyDispatchPanelMode('dispatch')
      setSelectedEnemyTacticNames([])
      setUavDispatchModalOpen(true)
    },
    [],
  )

  useEffect(() => {
    enemyPrevInsideGrdRef.current = {}
    grdOverlayActivePrevRef.current = false
  }, [enemyMarchSession])

  useEffect(() => {
    const overlayOn = BATTLEFIELD_PHASE_MAP_FLAGS[scenarioPhase].showSarGrdPeninsulaOverlay
    if (!overlayOn) {
      grdOverlayActivePrevRef.current = false
      return
    }
    if (!grdOverlayActivePrevRef.current) {
      // SAR GRD 오버레이가 처음 활성화되는 시점엔 내부 상태를 리셋해 첫 진입을 놓치지 않게 한다.
      enemyPrevInsideGrdRef.current = {}
    }
    if (simulationPaused || timelineApplyingRef.current) {
      grdOverlayActivePrevRef.current = true
      return
    }
    const mbtList = DUMMY_SCENARIO_ENTITIES.filter((e) => e.relation === 'ENEMY' && e.kind === 'MBT')
    let alertPayload: { motionId: string; enemyId: number; enemyName: string } | null = null
    for (const e of mbtList) {
      const pose = enemyBattlefieldPoses[e.id]
      if (!pose) continue
      const insideIds = findGrdMotionIdsContainingPoint(pose.lat, pose.lng)
      const inside = new Set(insideIds)
      const prev = enemyPrevInsideGrdRef.current[e.id] ?? new Set<string>()
      if (overlayOn && !alertPayload) {
        for (const mid of insideIds) {
          if (!prev.has(mid)) {
            alertPayload = {
              motionId: mid,
              enemyId: e.id,
              enemyName: formatScenarioEnemyCompact(e),
            }
            break
          }
        }
      }
      enemyPrevInsideGrdRef.current[e.id] = new Set(inside)
    }
    grdOverlayActivePrevRef.current = true
    if (!alertPayload) return
    setGrdHoverId(null)
    setGrdSelectedId(alertPayload.motionId)
    setGrdEnemyMotionAlert(alertPayload)
    setGrdMotionMapOverlayOn(true)
    setSimulationPaused(true)
    setScenarioNotice('시뮬레이션 일시정지 · SAR 이동 알림')
  }, [enemyBattlefieldPoses, scenarioPhase, simulationPaused])

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | null = null
    const MAX_RETRY = 25
    const RETRY_DELAY_MS = 900

    const loadAssets = (attempt: number) => {
      if (cancelled) return
      if (attempt === 1) {
        setAssetLoading(true)
        setAssetError(null)
      }

      void requestJson<FriendlyUnit[]>(`${getApiBaseUrl()}/map/units`)
        .then((units) => {
          if (cancelled) return
          const next = units
            .map((unit) => {
              const category = branchToServiceCategory(unit.branch)
              if (!category) return null
              return {
                id: unit.id,
                name: unit.name,
                lat: unit.lat,
                lng: unit.lng,
                unitCode: effectiveUnitIdentificationCode(category, unit.id, unit.unitCode),
                category,
                level: unit.level,
                formation: unit.formation ?? '대형 미지정',
                elevationM: unit.elevationM ?? 0,
                mgrs: unit.mgrs ?? 'MGRS-미지정',
                readiness: unit.readiness,
                mission: unit.mission,
                situationVideoUrl: unit.situationVideoUrl ?? null,
              } satisfies ServiceAssetPoint
            })
            .filter((row): row is ServiceAssetPoint => row != null)
          const redistributedNext = redistributeCommandAssetsAcrossSouthKorea(next)
          const commandEnsuredNext = ensureCommandAssetsPresence(redistributedNext)
          const nextWithGroundRadar = normalizeServiceAssetPoints([
            ...commandEnsuredNext,
            ...buildGroundRadarServiceAssets(),
          ])
          const nextUavDispatchAssets = units
            .filter((unit) => branchToServiceCategory(unit.branch) === 'UAV')
            .map(
              (unit) =>
                ({
                  id: unit.id,
                  name: unit.name,
                  lat: unit.lat,
                  lng: unit.lng,
                  mgrs: unit.mgrs ?? latLngToMgrsSafe(unit.lat, unit.lng),
                  readiness: unit.readiness,
                  mission: unit.mission,
                  equipment: unit.equipment,
                  personnel: unit.personnel,
                  formation: unit.formation ?? null,
                }) satisfies UavDispatchAsset,
            )
          const nextDroneDispatchAssets = units
            .filter((unit) => branchToServiceCategory(unit.branch) === 'DRONE')
            .map(
              (unit) =>
                ({
                  id: unit.id,
                  name: unit.name,
                  lat: unit.lat,
                  lng: unit.lng,
                  mgrs: unit.mgrs ?? latLngToMgrsSafe(unit.lat, unit.lng),
                  readiness: unit.readiness,
                  mission: unit.mission,
                  equipment: unit.equipment,
                  personnel: unit.personnel,
                  formation: unit.formation ?? null,
                }) satisfies UavDispatchAsset,
            )
          for (const asset of nextUavDispatchAssets) {
            if (!uavHomeByIdRef.current[asset.id]) {
              uavHomeByIdRef.current[asset.id] = { lat: asset.lat, lng: asset.lng }
            }
          }
          for (const asset of nextDroneDispatchAssets) {
            if (!droneHomeByIdRef.current[asset.id]) {
              droneHomeByIdRef.current[asset.id] = { lat: asset.lat, lng: asset.lng }
            }
          }
          setAssets(nextWithGroundRadar)
          setUavDispatchAssets(nextUavDispatchAssets)
          setDroneDispatchAssets(nextDroneDispatchAssets)
          setAssetError(null)
          setAssetLoading(false)
        })
        .catch((error) => {
          if (cancelled) return
          const message = error instanceof Error ? error.message : '자산 위치를 불러오지 못했습니다.'
          if (attempt < MAX_RETRY) {
            setAssetError(`자산 위치 연결 대기중... (${attempt}/${MAX_RETRY})`)
            retryTimer = window.setTimeout(() => loadAssets(attempt + 1), RETRY_DELAY_MS)
            return
          }
          setUavDispatchAssets([])
          setDroneDispatchAssets([])
          setAssetError(message)
          setAssetLoading(false)
        })
    }

    loadAssets(1)

    return () => {
      cancelled = true
      if (retryTimer != null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [])

  const grouped = useMemo(
    () => ({
      SAR: assets.filter((asset) => asset.category === 'SAR'),
      UAV: assets.filter((asset) => asset.category === 'UAV'),
      DRONE: assets.filter((asset) => asset.category === 'DRONE'),
      GROUND_RADAR: assets.filter((asset) => asset.category === 'GROUND_RADAR'),
      DIVISION: assets.filter((asset) => asset.category === 'DIVISION'),
      UPPER_COMMAND: assets.filter((asset) => asset.category === 'UPPER_COMMAND'),
      ARTILLERY: assets.filter((asset) => asset.category === 'ARTILLERY'),
      ARMOR: assets.filter((asset) => asset.category === 'ARMOR'),
    }),
    [assets],
  )

  const groundRadarVodAnalytics = useMemo(() => {
    const enemies = scenarioEntitiesResolved.filter(
      (entity) => entity.relation === 'ENEMY' && entity.kind === 'MBT',
    )
    const detectedById = new Map<number, GroundRadarDetectedEnemy>()
    for (const enemy of enemies) {
      const detected = GROUND_RADAR_SITES.some((site) => isPointInsideGroundRadarSector(site, enemy))
      if (!detected) continue
      detectedById.set(enemy.id, {
        enemyId: enemy.id,
        name: formatScenarioEnemyCompact(enemy),
        lat: enemy.lat,
        lng: enemy.lng,
        headingDeg: enemy.headingDeg,
        speedKph: enemy.speedKph,
      })
    }
    const detected = Array.from(detectedById.values())
    const clusterLabels = runDbscanByHaversine(detected, 16, 1)
    const clusterIds = Array.from(new Set(clusterLabels.filter((id) => id >= 0)))
    const clusterRiskZones = clusterIds.map((clusterId) => {
      const members = detected.filter((_, idx) => clusterLabels[idx] === clusterId)
      const centerLat = members.reduce((sum, m) => sum + m.lat, 0) / members.length
      const centerLng = members.reduce((sum, m) => sum + m.lng, 0) / members.length
      const avgSpeed = members.reduce((sum, m) => sum + m.speedKph, 0) / members.length
      const baseRadiusKm = Math.min(18, Math.max(8, 7 + members.length * 2 + avgSpeed / 38))
      return {
        clusterId,
        centerLat,
        centerLng,
        memberCount: members.length,
        avgSpeed,
        radius3Km: Math.max(6, Math.min(14, baseRadiusKm * 0.82)),
        radius5Km: Math.max(8, Math.min(20, baseRadiusKm * 1.05)),
        score3: Math.min(100, Math.round(52 + members.length * 12 + avgSpeed * 0.24)),
        score5: Math.min(100, Math.round(58 + members.length * 14 + avgSpeed * 0.28)),
      }
    })

    const features: GroundRadarVodFeatureCollection['features'] = []
    const futureRiskCandidatesByWindow: Record<3 | 5, FutureRiskCandidate[]> = { 3: [], 5: [] }

    for (let i = 0; i < detected.length; i += 1) {
      const row = detected[i]!
      const clusterId = clusterLabels[i] ?? -1
      features.push({
        type: 'Feature',
        properties: {
          kind: 'dbscan',
          enemyId: row.enemyId,
          enemyName: row.name,
          clusterId,
          headingDeg: row.headingDeg,
          speedKph: row.speedKph,
        },
        geometry: {
          type: 'Point',
          coordinates: [row.lng, row.lat],
        },
      })

      const history = enemyTrackHistoryRef.current[row.enemyId] ?? []
      const addFramePredictionFeatures = (
        frameWindow: 3 | 5,
        kinds: {
          pastLine: 'predict_past_3' | 'predict_past_5'
          pastPoint: 'past_point_3' | 'past_point_5'
          mainLine: 'axis_main_3' | 'axis_main_5'
          futurePoint: 'future_point_3' | 'future_point_5'
          corridor: 'corridor_3' | 'corridor_5'
        },
      ) => {
        const predicted = buildFrameWindowPrediction(history, frameWindow)
        if (!predicted) return
        const { past, headingDeg } = predicted
        const fullPast = history.length >= 2 ? history : past
        const lastPast = past[past.length - 1]!
        const rangeKm = Math.max(
          15,
          Math.min(25, row.speedKph * (frameWindow === 3 ? 0.048 : 0.058)),
        )
        const mainAxis = buildVectorAxisPath(lastPast, headingDeg, rangeKm, 0, 0)
        const coneHalfAngleDeg = frameWindow === 3 ? 18 : 30
        const corridorRing = buildVectorConeRing(lastPast, headingDeg, rangeKm, coneHalfAngleDeg)
        const riskZonesForMode = clusterRiskZones.map((zone) => ({
          clusterId: zone.clusterId,
          centerLat: zone.centerLat,
          centerLng: zone.centerLng,
          radiusKm: frameWindow === 3 ? zone.radius3Km : zone.radius5Km,
        }))
        const overlapMain = pathOverlapsRiskZones(mainAxis, clusterId, riskZonesForMode)
        const speedKmPerMin = Math.max(0.35, row.speedKph / 60)
        const mainAxisEnd = mainAxis[mainAxis.length - 1]
        if (mainAxisEnd) {
          const axisDistanceKm = polylineLengthKm(mainAxis)
          const etaMin = axisDistanceKm / speedKmPerMin
          futureRiskCandidatesByWindow[frameWindow].push({
            frameWindow,
            enemyId: row.enemyId,
            enemyName: row.name,
            clusterId,
            lat: mainAxisEnd.lat,
            lng: mainAxisEnd.lng,
            probability: 1,
            etaMin,
            speedKph: row.speedKph,
          })
        }

        features.push({
          type: 'Feature',
          properties: {
            kind: kinds.pastLine,
            enemyId: row.enemyId,
            enemyName: row.name,
            clusterId,
            frameWindow,
          },
          geometry: {
            type: 'LineString',
            coordinates: fullPast.map((point) => [point.lng, point.lat] as [number, number]),
          },
        })
        for (let step = 0; step < past.length; step += 1) {
          const point = past[step]!
          features.push({
            type: 'Feature',
            properties: {
              kind: kinds.pastPoint,
              enemyId: row.enemyId,
              enemyName: row.name,
              clusterId,
              frameWindow,
              step,
            },
            geometry: {
              type: 'Point',
              coordinates: [point.lng, point.lat],
            },
          })
        }

        features.push({
          type: 'Feature',
          properties: {
            kind: kinds.mainLine,
            enemyId: row.enemyId,
            enemyName: row.name,
            clusterId,
            frameWindow,
            overlapRisk: overlapMain,
            bearingDeg: headingDeg,
            predictedLengthKm: rangeKm,
            pathProbabilityPct: 100,
          },
          geometry: {
            type: 'LineString',
            coordinates: mainAxis.map((point) => [point.lng, point.lat] as [number, number]),
          },
        })

        const futurePoints = mainAxis.slice(1).map((point) => ({ point, axisSide: 'main' as const }))
        for (let step = 0; step < futurePoints.length; step += 1) {
          const rowPoint = futurePoints[step]!
          const point = rowPoint.point
          features.push({
            type: 'Feature',
            properties: {
              kind: kinds.futurePoint,
              enemyId: row.enemyId,
              enemyName: row.name,
              clusterId,
              frameWindow,
              step: step + 1,
              speedKph: row.speedKph,
              axisSide: rowPoint.axisSide,
            },
            geometry: {
              type: 'Point',
              coordinates: [point.lng, point.lat],
            },
          })
        }

        features.push({
          type: 'Feature',
          properties: {
            kind: kinds.corridor,
            enemyId: row.enemyId,
            enemyName: row.name,
            clusterId,
            frameWindow,
            overlapRisk: overlapMain,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [corridorRing],
          },
        })
      }

      addFramePredictionFeatures(3, {
        pastLine: 'predict_past_3',
        pastPoint: 'past_point_3',
        mainLine: 'axis_main_3',
        futurePoint: 'future_point_3',
        corridor: 'corridor_3',
      })
      addFramePredictionFeatures(5, {
        pastLine: 'predict_past_5',
        pastPoint: 'past_point_5',
        mainLine: 'axis_main_5',
        futurePoint: 'future_point_5',
        corridor: 'corridor_5',
      })
    }

    const futureRisk3 = buildProbabilisticFutureRiskZones(futureRiskCandidatesByWindow[3], 3)
    const futureRisk5 = buildProbabilisticFutureRiskZones(futureRiskCandidatesByWindow[5], 5)
    futureRisk3.forEach((zone, idx) => {
      features.push({
        type: 'Feature',
        properties: {
          kind: 'risk_3',
          clusterId: 3000 + idx,
          riskScore: zone.riskScore,
          targetCount: zone.targetCount,
          probabilityPct: zone.probabilityPct,
          etaMin: zone.etaMin,
          horizonMin: 12,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [buildCircleRing(zone.centerLat, zone.centerLng, zone.radiusKm)],
        },
      })
    })
    futureRisk5.forEach((zone, idx) => {
      features.push({
        type: 'Feature',
        properties: {
          kind: 'risk_5',
          clusterId: 5000 + idx,
          riskScore: zone.riskScore,
          targetCount: zone.targetCount,
          probabilityPct: zone.probabilityPct,
          etaMin: zone.etaMin,
          horizonMin: 20,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [buildCircleRing(zone.centerLat, zone.centerLng, zone.radiusKm)],
        },
      })
    })

    return {
      detectedCount: detected.length,
      clusterCount: clusterIds.length,
      geojson: {
        type: 'FeatureCollection',
        features,
      } as GroundRadarVodFeatureCollection,
    }
  }, [scenarioEntitiesResolved])

  /** 우측 패널에서 카테고리를 펼쳐도 지도에는 DB 자산 전체를 유지(누락 방지) */
  const assetsForBattlefieldMap = useMemo(() => assets, [assets])

  const sensorPaths = useMemo(() => {
    const fallback = buildFallbackPath(37.67, 126.95)
    const battalionTrack = [...grouped.DIVISION, ...grouped.UPPER_COMMAND]
      .slice(0, 7)
      .map((asset) => ({ lat: asset.lat, lng: asset.lng }))

    let dronePath: Array<{ lat: number; lng: number }>
    let droneDestLat: number | undefined
    let droneDestLng: number | undefined
    if (droneStrikeEntityId != null) {
      const ent = scenarioEntitiesResolved.find((x) => x.id === droneStrikeEntityId)
      if (ent) {
        droneDestLat = ent.lat
        droneDestLng = ent.lng
      }
    }
    if (droneDestLat == null && droneStrikeTarget) {
      droneDestLat = droneStrikeTarget.lat
      droneDestLng = droneStrikeTarget.lng
    }
    if (droneDestLat != null && droneDestLng != null) {
      const launch =
        grouped.DRONE.length > 0
          ? { lat: grouped.DRONE[0]!.lat, lng: grouped.DRONE[0]!.lng }
          : grouped.UAV.length > 0
            ? { lat: grouped.UAV[0]!.lat, lng: grouped.UAV[0]!.lng }
            : { lat: fallback[0]!.lat, lng: fallback[0]!.lng }
      dronePath = buildGreatCircleInvasionPath(
        launch.lat,
        launch.lng,
        droneDestLat,
        droneDestLng,
        7331,
      )
    } else {
      dronePath =
        grouped.DRONE.length > 0 ? grouped.DRONE.map((asset) => ({ lat: asset.lat, lng: asset.lng })) : fallback
    }

    return {
      sar: grouped.SAR.length > 0 ? grouped.SAR.map((asset) => ({ lat: asset.lat, lng: asset.lng })) : fallback,
      uav: grouped.UAV.length > 0 ? grouped.UAV.map((asset) => ({ lat: asset.lat, lng: asset.lng })) : fallback,
      drone: dronePath,
      fmcw: battalionTrack.length > 0 ? battalionTrack : fallback,
    } satisfies Record<ServiceSensorId, Array<{ lat: number; lng: number }>>
  }, [
    grouped.DIVISION,
    grouped.DRONE,
    grouped.SAR,
    grouped.UAV,
    grouped.UPPER_COMMAND,
    droneStrikeTarget,
    droneStrikeEntityId,
    scenarioEntitiesResolved,
  ])

  const sensorPathsRef = useRef(sensorPaths)
  sensorPathsRef.current = sensorPaths

  /** 작전 구역 확정마다: 백엔드 OSRM driving으로 각 적 MBT·GRD 표적의 남하 도로(또는 폴백 직선) 궤적 로드 */
  useEffect(() => {
    if (enemyMarchSession < 1) return undefined
    let cancelled = false
    const mbtList = DUMMY_SCENARIO_ENTITIES.filter((e) => e.relation === 'ENEMY' && e.kind === 'MBT')

    const run = async () => {
      enemyMarchRoutesRef.current = {}
      enemyMarchCumRef.current = {}
      enemyMarchAlongMRef.current = {}
      enemyTrackHistoryRef.current = {}

      // 1) OSRM 응답 대기 전에도 즉시 움직이도록 폴백 궤적을 먼저 적용
      const initialPoses: Record<number, { lat: number; lng: number }> = {}
      for (const e of mbtList) {
        // 모든 적 MBT를 우선 기본 좌표로 노출(고정 표적 포함)
        initialPoses[e.id] = { lat: e.lat, lng: e.lng }
        enemyMarchAlongMRef.current[e.id] = 0

        if (IMMOBILE_ENEMY_ENTITY_IDS.has(e.id)) continue

        const goal = BATTLEFIELD_MBT_MARCH_GOALS[e.id]
        if (!goal) continue
        const from: MarchPoint = { lat: e.lat, lng: e.lng }
        const fallback = fallbackStraightMarchPolyline(from, goal)
        const cum = buildCumulativeM(fallback)
        enemyMarchRoutesRef.current[e.id] = fallback
        enemyMarchCumRef.current[e.id] = cum
        if (cum.length > 0) {
          initialPoses[e.id] = positionAlongPolylineM(fallback, cum, 0)
        }
      }
      setEnemyBattlefieldPoses(initialPoses)

      await Promise.all(
        mbtList.map(async (e) => {
          if (IMMOBILE_ENEMY_ENTITY_IDS.has(e.id)) return
          const goal = BATTLEFIELD_MBT_MARCH_GOALS[e.id]
          if (!goal) return
          const from: MarchPoint = { lat: e.lat, lng: e.lng }
          try {
            const url = drivingRouteRequestUrl(getApiBaseUrl(), from, goal)
            const res = await requestJson<{ coordinates: MarchPoint[] }>(url)
            if (!isEnemyMarchLandPolyline(res.coordinates)) return
            if (cancelled) return

            const nextPoly = res.coordinates
            const nextCum = buildCumulativeM(nextPoly)
            const nextTotal = nextCum[nextCum.length - 1] ?? 0
            const prevCum = enemyMarchCumRef.current[e.id]
            const prevTotal = prevCum?.length ? prevCum[prevCum.length - 1]! : 0
            const prevAlong = enemyMarchAlongMRef.current[e.id] ?? 0

            enemyMarchRoutesRef.current[e.id] = nextPoly
            enemyMarchCumRef.current[e.id] = nextCum
            if (prevTotal > 1e-6 && nextTotal > 1e-6) {
              const progressed = prevAlong / prevTotal
              enemyMarchAlongMRef.current[e.id] = Math.min(
                progressed * nextTotal,
                Math.max(0, nextTotal - 1e-6),
              )
            } else {
              enemyMarchAlongMRef.current[e.id] = 0
            }
          } catch {
            // 폴백 직선은 이미 반영됨
          }
        }),
      )

      if (cancelled) return
      setEnemyBattlefieldPoses((prev) => {
        const next: Record<number, { lat: number; lng: number }> = { ...prev }
        for (const e of mbtList) {
          const poly = enemyMarchRoutesRef.current[e.id]
          const cum = enemyMarchCumRef.current[e.id]
          if (poly && cum?.length) {
            const m = enemyMarchAlongMRef.current[e.id] ?? 0
            next[e.id] = positionAlongPolylineM(poly, cum, m)
          }
        }
        return next
      })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enemyMarchSession])

  /** OSRM 폴리라인을 따라 같은 id 핀만 이동(신규 마커 없음) */
  useEffect(() => {
    const marchPhase =
      sarSpotlightSeen &&
      (scenarioPhase === BattlefieldScenarioPhase.SAR_SCAN ||
        scenarioPhase === BattlefieldScenarioPhase.UAV_DISPATCHED ||
        scenarioPhase === BattlefieldScenarioPhase.DRONE_RECON ||
        scenarioPhase === BattlefieldScenarioPhase.FMCW_ANALYSIS)
    if (!mapReady || !marchPhase || simulationPaused) return undefined
    const tickMs = 500
    const timer = window.setInterval(() => {
      setEnemyBattlefieldPoses((prev) => {
        const next = { ...prev }
        for (const e of DUMMY_SCENARIO_ENTITIES) {
          if (e.relation !== 'ENEMY' || e.kind !== 'MBT') continue
          if (IMMOBILE_ENEMY_ENTITY_IDS.has(e.id)) continue
          const poly = enemyMarchRoutesRef.current[e.id]
          const cum = enemyMarchCumRef.current[e.id]
          if (!poly || !cum || poly.length < 2) continue
          const marchScale = BATTLEFIELD_ENEMY_MARCH_TIME_SCALE * battlefieldSpeedMultiplier
          const stepM =
            ((e.speedKph * 1000) / 3600) * (tickMs / 1000) * marchScale
          const maxM = cum[cum.length - 1]! - 1e-6
          const curM = enemyMarchAlongMRef.current[e.id] ?? 0
          const m = Math.min(curM + stepM, maxM)
          enemyMarchAlongMRef.current[e.id] = m
          next[e.id] = positionAlongPolylineM(poly, cum, m)
        }
        return next
      })
    }, tickMs)
    return () => window.clearInterval(timer)
  }, [mapReady, scenarioPhase, battlefieldSpeedMultiplier, simulationPaused, sarSpotlightSeen])

  useEffect(() => {
    const marchPhase =
      sarSpotlightSeen &&
      (scenarioPhase === BattlefieldScenarioPhase.SAR_SCAN ||
        scenarioPhase === BattlefieldScenarioPhase.UAV_DISPATCHED ||
        scenarioPhase === BattlefieldScenarioPhase.DRONE_RECON ||
        scenarioPhase === BattlefieldScenarioPhase.FMCW_ANALYSIS)
    if (!marchPhase || simulationPaused || timelineApplyingRef.current) return
    const historyMap = enemyTrackHistoryRef.current
    for (const entity of DUMMY_SCENARIO_ENTITIES) {
      if (entity.relation !== 'ENEMY' || entity.kind !== 'MBT') continue
      const pose = enemyBattlefieldPoses[entity.id] ?? { lat: entity.lat, lng: entity.lng }
      const prev = historyMap[entity.id] ?? []
      const last = prev[prev.length - 1]
      if (last && haversineKm(last, pose) < 0.008) continue
      const next = [...prev, { lat: pose.lat, lng: pose.lng }]
      historyMap[entity.id] = next
    }
  }, [enemyBattlefieldPoses, scenarioPhase, simulationPaused, sarSpotlightSeen])

  useEffect(() => {
    if (scenarioPhase !== BattlefieldScenarioPhase.IDLE) return undefined
    setUavSimPos(null)
    setDroneSimPos(null)
    uavReturnToBaseRef.current = null
    droneReturnToBaseRef.current = null
    uavChasingEnemyIdRef.current = null
    uavGrdMissionRef.current = null
    droneChasingEnemyIdRef.current = null
    droneMissionRef.current = null
    setActiveDispatchedUav(null)
    setActiveDispatchedDroneId(null)
    setActiveUavDispatchTarget(null)
    return undefined
  }, [scenarioPhase])

  /** UAV 출동 단계: GRD 목표로 접근하다 탐지 거리 내 적 MBT를 발견하면 해당 표적을 따라 이동 */
  useEffect(() => {
    if (!sensorState.uav.running || uavSimPos == null || simulationPaused) {
      return undefined
    }
    const stepKm =
      activeDispatchedUav == null
        ? BATTLEFIELD_UAV_SIM_STEP_KM
        : BATTLEFIELD_UAV_DISPATCH_STEP_KM
    const scaledStepKm = stepKm * battlefieldSpeedMultiplier
    const acquireKm = BATTLEFIELD_UAV_ENEMY_ACQUIRE_KM
    const tick = () => {
      setUavSimPos((prev) => {
        if (!prev) return prev
        const returnTarget = uavReturnToBaseRef.current
        if (returnTarget) {
          const distToBaseKm = haversineKm(prev, returnTarget)
          if (distToBaseKm <= scaledStepKm) {
            uavReturnToBaseRef.current = null
            setSensorState((state) => ({ ...state, uav: { ...state.uav, running: false } }))
            setScenarioNotice('UAV 회항 완료: 최초 배치 위치로 복귀했습니다.')
            return { lat: returnTarget.lat, lng: returnTarget.lng }
          }
          const brgToBase = bearingDeg(prev.lat, prev.lng, returnTarget.lat, returnTarget.lng)
          const movedToBase = offsetLatLng(prev.lat, prev.lng, brgToBase, scaledStepKm)
          return { lat: movedToBase.lat, lng: movedToBase.lng }
        }
        const poses = enemyBattlefieldPosesRef.current
        const enemyPts = DUMMY_SCENARIO_ENTITIES.filter(
          (e) => e.relation === 'ENEMY' && e.kind === 'MBT',
        ).map((e) => {
          const p = poses[e.id] ?? { lat: e.lat, lng: e.lng }
          return { id: e.id, lat: p.lat, lng: p.lng }
        })

        let chaseId = uavChasingEnemyIdRef.current
        if (chaseId != null) {
          const locked = enemyPts.find((x) => x.id === chaseId)
          if (locked) {
            const brg = bearingDeg(prev.lat, prev.lng, locked.lat, locked.lng)
            const moved = offsetLatLng(prev.lat, prev.lng, brg, scaledStepKm)
            return { lat: moved.lat, lng: moved.lng }
          }
          uavChasingEnemyIdRef.current = null
          chaseId = null
        }

        let nearest: { id: number; lat: number; lng: number; d: number } | null = null
        for (const pt of enemyPts) {
          const d = haversineKm(prev, pt)
          if (d <= acquireKm && (!nearest || d < nearest.d)) {
            nearest = { id: pt.id, lat: pt.lat, lng: pt.lng, d }
          }
        }
        if (nearest) {
          uavChasingEnemyIdRef.current = nearest.id
          const brg = bearingDeg(prev.lat, prev.lng, nearest.lat, nearest.lng)
          const moved = offsetLatLng(prev.lat, prev.lng, brg, scaledStepKm)
          return { lat: moved.lat, lng: moved.lng }
        }

        const mission = uavGrdMissionRef.current
        if (!mission) return prev
        const brg = bearingDeg(prev.lat, prev.lng, mission.centerLat, mission.centerLng)
        const moved = offsetLatLng(prev.lat, prev.lng, brg, scaledStepKm)
        return { lat: moved.lat, lng: moved.lng }
      })
    }
    const id = window.setInterval(tick, activeDispatchedUav == null ? 700 : 350)
    return () => window.clearInterval(id)
  }, [sensorState.uav.running, activeDispatchedUav, uavSimPos, battlefieldSpeedMultiplier, simulationPaused])

  /** 드론도 UAV와 동일하게 목표로 접근 후, 탐지 반경 내 적 MBT를 추적 */
  useEffect(() => {
    if (!sensorState.drone.running || droneSimPos == null || simulationPaused) {
      return undefined
    }
    const stepKm = BATTLEFIELD_DRONE_SIM_STEP_KM * battlefieldSpeedMultiplier
    const acquireKm = BATTLEFIELD_DRONE_ENEMY_ACQUIRE_KM
    const tick = () => {
      setDroneSimPos((prev) => {
        if (!prev) return prev
        const returnTarget = droneReturnToBaseRef.current
        if (returnTarget) {
          const distToBaseKm = haversineKm(prev, returnTarget)
          if (distToBaseKm <= stepKm) {
            droneReturnToBaseRef.current = null
            setSensorState((state) => ({ ...state, drone: { ...state.drone, running: false } }))
            setScenarioNotice('드론 회항 완료: 최초 배치 위치로 복귀했습니다.')
            return { lat: returnTarget.lat, lng: returnTarget.lng }
          }
          const brgToBase = bearingDeg(prev.lat, prev.lng, returnTarget.lat, returnTarget.lng)
          const movedToBase = offsetLatLng(prev.lat, prev.lng, brgToBase, stepKm)
          return { lat: movedToBase.lat, lng: movedToBase.lng }
        }
        const poses = enemyBattlefieldPosesRef.current
        const enemyPts = DUMMY_SCENARIO_ENTITIES.filter(
          (e) => e.relation === 'ENEMY' && e.kind === 'MBT',
        ).map((e) => {
          const p = poses[e.id] ?? { lat: e.lat, lng: e.lng }
          return { id: e.id, lat: p.lat, lng: p.lng }
        })

        let chaseId = droneChasingEnemyIdRef.current
        if (chaseId != null) {
          const locked = enemyPts.find((x) => x.id === chaseId)
          if (locked) {
            const brg = bearingDeg(prev.lat, prev.lng, locked.lat, locked.lng)
            const moved = offsetLatLng(prev.lat, prev.lng, brg, stepKm)
            return { lat: moved.lat, lng: moved.lng }
          }
          droneChasingEnemyIdRef.current = null
          chaseId = null
        }

        let nearest: { id: number; lat: number; lng: number; d: number } | null = null
        for (const pt of enemyPts) {
          const d = haversineKm(prev, pt)
          if (d <= acquireKm && (!nearest || d < nearest.d)) {
            nearest = { id: pt.id, lat: pt.lat, lng: pt.lng, d }
          }
        }
        if (nearest) {
          droneChasingEnemyIdRef.current = nearest.id
          const brg = bearingDeg(prev.lat, prev.lng, nearest.lat, nearest.lng)
          const moved = offsetLatLng(prev.lat, prev.lng, brg, stepKm)
          return { lat: moved.lat, lng: moved.lng }
        }

        const mission = droneMissionRef.current
        if (!mission) return prev
        const brg = bearingDeg(prev.lat, prev.lng, mission.centerLat, mission.centerLng)
        const moved = offsetLatLng(prev.lat, prev.lng, brg, stepKm)
        return { lat: moved.lat, lng: moved.lng }
      })
    }
    const id = window.setInterval(tick, 350)
    return () => window.clearInterval(id)
  }, [sensorState.drone.running, droneSimPos, battlefieldSpeedMultiplier, simulationPaused])

  useEffect(() => {
    if (!sensorState.drone.running) return
    if (droneStrikeEntityId != null) {
      const strike = scenarioEntitiesResolved.find((entity) => entity.id === droneStrikeEntityId)
      if (strike) {
        droneMissionRef.current = { centerLat: strike.lat, centerLng: strike.lng }
        droneChasingEnemyIdRef.current = strike.id
        return
      }
    }
    if (droneStrikeTarget) {
      droneMissionRef.current = { centerLat: droneStrikeTarget.lat, centerLng: droneStrikeTarget.lng }
      droneChasingEnemyIdRef.current = null
      return
    }
    droneMissionRef.current = null
    droneChasingEnemyIdRef.current = null
  }, [sensorState.drone.running, droneStrikeEntityId, droneStrikeTarget, scenarioEntitiesResolved])

  /**
   * UAV 출동 후보에서 선택한 실제 DB 자산(UAV EO/IR)도 명령 지점으로 함께 이동
   * - 지도의 자산 핀(assets) + 출동 후보 계산용 uavDispatchAssets 좌표를 동시에 갱신
   */
  useEffect(() => {
    if (!activeDispatchedUav || !uavSimPos) return
    const nextMgrs = latLngToMgrsSafe(uavSimPos.lat, uavSimPos.lng)
    setAssets((prev) => {
      let changed = false
      const next = prev.map((asset) => {
        if (asset.id !== activeDispatchedUav.id || asset.category !== 'UAV') return asset
        if (
          Math.abs(asset.lat - uavSimPos.lat) < 1e-8 &&
          Math.abs(asset.lng - uavSimPos.lng) < 1e-8
        ) {
          return asset
        }
        changed = true
        return {
          ...asset,
          lat: uavSimPos.lat,
          lng: uavSimPos.lng,
          mgrs: nextMgrs,
        }
      })
      return changed ? next : prev
    })
    setUavDispatchAssets((prev) => {
      let changed = false
      const next = prev.map((asset) => {
        if (asset.id !== activeDispatchedUav.id) return asset
        if (
          Math.abs(asset.lat - uavSimPos.lat) < 1e-8 &&
          Math.abs(asset.lng - uavSimPos.lng) < 1e-8
        ) {
          return asset
        }
        changed = true
        return {
          ...asset,
          lat: uavSimPos.lat,
          lng: uavSimPos.lng,
          mgrs: nextMgrs,
        }
      })
      return changed ? next : prev
    })
  }, [activeDispatchedUav, uavSimPos])

  /** 선택된 드론 자산도 시뮬 위치와 함께 갱신(회항 포함) */
  useEffect(() => {
    if (activeDispatchedDroneId == null || !droneSimPos) return
    const nextMgrs = latLngToMgrsSafe(droneSimPos.lat, droneSimPos.lng)
    setAssets((prev) => {
      let changed = false
      const next = prev.map((asset) => {
        if (asset.id !== activeDispatchedDroneId || asset.category !== 'DRONE') return asset
        if (Math.abs(asset.lat - droneSimPos.lat) < 1e-8 && Math.abs(asset.lng - droneSimPos.lng) < 1e-8) {
          return asset
        }
        changed = true
        return {
          ...asset,
          lat: droneSimPos.lat,
          lng: droneSimPos.lng,
          mgrs: nextMgrs,
        }
      })
      return changed ? next : prev
    })
    setDroneDispatchAssets((prev) => {
      let changed = false
      const next = prev.map((asset) => {
        if (asset.id !== activeDispatchedDroneId) return asset
        if (Math.abs(asset.lat - droneSimPos.lat) < 1e-8 && Math.abs(asset.lng - droneSimPos.lng) < 1e-8) {
          return asset
        }
        changed = true
        return {
          ...asset,
          lat: droneSimPos.lat,
          lng: droneSimPos.lng,
          mgrs: nextMgrs,
        }
      })
      return changed ? next : prev
    })
  }, [activeDispatchedDroneId, droneSimPos])

  useEffect(() => {
    if (simulationPaused) return undefined
    const timer = window.setInterval(() => {
      setSensorState((prev) => {
        const next: ServiceSensorState = { ...prev }
        let changed = false
        const ids: ServiceSensorId[] = ['sar', 'uav', 'drone', 'fmcw']
        for (const id of ids) {
          if (id === 'sar') continue
          if (id === 'uav' && uavSimPosRef.current != null) continue
          if (id === 'drone' && droneSimPosRef.current != null) continue
          const current = prev[id]
          if (!current.running) continue
          const pathLength = sensorPaths[id].length
          if (pathLength <= 1) continue
          next[id] = { running: true, index: (current.index + 1) % pathLength }
          changed = true
        }
        return changed ? next : prev
      })
    }, 1200)

    return () => window.clearInterval(timer)
  }, [sensorPaths, simulationPaused])

  const movingPoints = useMemo(() => {
    const ids: ServiceSensorId[] = ['sar', 'uav', 'drone', 'fmcw']
    const out: Array<{
      id: number
      name: string
      lat: number
      lng: number
      category: string
      speedKph?: number
      headingDeg?: number
      riskLevel?: string
      mission?: string
    }> = []
    for (const id of ids) {
      if (id === 'sar') continue
      const state = sensorState[id]
      if (!state.running) continue
      const path = sensorPaths[id]
      if (path.length === 0) continue
      let point = path[state.index % path.length]!
      if (id === 'uav' && uavSimPos) {
        point = uavSimPos
      }
      if (id === 'drone' && droneSimPos) {
        point = droneSimPos
      }
      out.push({
        id: -1000 - out.length,
        name:
          id === 'drone'
            ? '드론 · 근접 EO 정찰'
            : id === 'uav' && activeDispatchedUav
              ? `${activeDispatchedUav.name} 이동`
              : `${SENSOR_BUTTON_META[id].label} 이동`,
        lat: point.lat,
        lng: point.lng,
        category: `MOVING_${id.toUpperCase()}`,
      })
    }
    if (sensorState.uav.running && activeUavDispatchTarget) {
      out.push({
        id: -2000,
        name: 'UAV 목표 지점',
        lat: activeUavDispatchTarget.lat,
        lng: activeUavDispatchTarget.lng,
        category: 'MOVING_UAV_TARGET',
      })
    }
    const fmcwTrackedEnemies = scenarioEntitiesResolved.filter(
      (entity) =>
        entity.relation === 'ENEMY' &&
        entity.kind === 'MBT' &&
        GROUND_RADAR_SITES.some((site) => isPointInsideGroundRadarSector(site, entity)),
    )
    fmcwTrackedEnemies.forEach((enemy, index) => {
      out.push({
        id: -3000 - index,
        name: `FMCW 추정점 ${index + 1}`,
        lat: enemy.lat,
        lng: enemy.lng,
        category: 'MOVING_FMCW_ENEMY',
        speedKph: enemy.speedKph,
        headingDeg: enemy.headingDeg,
        riskLevel: enemy.riskLevel,
        mission: `${formatScenarioEnemyCompact(enemy)} · FMCW 반사점 추정`,
      })
    })
    return out
  }, [
    activeDispatchedUav,
    activeUavDispatchTarget,
    scenarioEntitiesResolved,
    scenarioPhase,
    sensorPaths,
    sensorState,
    uavSimPos,
    droneSimPos,
  ])

  const movingPointsForMap = useMemo(() => {
    return movingPoints.filter((row) => {
      if (row.category === 'MOVING_UAV') {
        return uavSimPos != null && sensorState.uav.running
      }
      if (row.category === 'MOVING_UAV_TARGET') {
        return sensorState.uav.running
      }
      if (row.category === 'MOVING_DRONE') {
        return sensorState.drone.running && droneSimPos != null
      }
      if (row.category === 'MOVING_FMCW') {
        return phaseAtLeast(scenarioPhase, BattlefieldScenarioPhase.FMCW_ANALYSIS)
      }
      if (row.category === 'MOVING_FMCW_ENEMY') return true
      return true
    })
  }, [movingPoints, scenarioPhase, uavSimPos, sensorState.uav.running, sensorState.drone.running, droneSimPos])

  const uavMvpHudSnapshot = useMemo((): UavMvpSnapshot | null => {
    if (!phaseAtLeast(scenarioPhase, BattlefieldScenarioPhase.UAV_DISPATCHED)) return null
    const path = sensorPaths.uav
    if (path.length === 0) return null
    const st = sensorState.uav
    const point = uavSimPos ?? path[st.index % path.length]!
    const headingDegEst =
      uavSimPos != null
        ? uavSimHeadingForPopup(
            point.lat,
            point.lng,
            uavChasingEnemyIdRef.current,
            uavGrdMissionRef.current,
            enemyBattlefieldPoses,
          )
        : undefined
    return buildUavMvpSnapshot({
      lat: point.lat,
      lng: point.lng,
      mgrs: latLngToMgrsSafe(point.lat, point.lng),
      pathLength: path.length,
      pathIndex: st.index,
      running: st.running,
      phaseAtLeastUav: true,
      headingDegEst,
      platformOverride:
        activeDispatchedUav == null
          ? undefined
          : {
              callSign: activeDispatchedUav.name,
              platformId: activeDispatchedUav.equipment ?? undefined,
              eoIrNote: activeDispatchedUav.equipment ?? undefined,
              sarFollowupLine: `${activeDispatchedUav.mission} · 준비태세 ${activeDispatchedUav.readiness}`,
            },
    })
  }, [
    activeDispatchedUav,
    scenarioPhase,
    sensorPaths.uav,
    sensorState.uav,
    uavSimPos,
    enemyBattlefieldPoses,
  ])

  const droneMvpHudSnapshot = useMemo((): DroneMvpSnapshot | null => {
    if (!phaseAtLeast(scenarioPhase, BattlefieldScenarioPhase.DRONE_RECON)) return null
    const path = sensorPaths.drone
    if (path.length === 0) return null
    const st = sensorState.drone
    const point = droneSimPos ?? path[st.index % path.length]!
    return snapshotDroneMvpForBattlefieldService(
      {
        lat: point.lat,
        lng: point.lng,
        mgrs: latLngToMgrsSafe(point.lat, point.lng),
        pathLength: path.length,
        pathIndex: st.index,
        running: st.running,
        phaseAtLeastDrone: true,
      },
      { strikeTarget: droneStrikeTarget },
      scenarioEntitiesResolved,
    )
  }, [scenarioPhase, scenarioEntitiesResolved, sensorPaths.drone, sensorState.drone, droneStrikeTarget, droneSimPos])

  const fmcwMvpBundle = useMemo(
    () =>
      buildFmcwMvpBundle(
        assets.map((a) => ({
          name: a.name,
          category: a.category,
          lat: a.lat,
          lng: a.lng,
        })),
      ),
    [assets],
  )

  const fmcwBundleRef = useRef<FmcwMvpBundle>(fmcwMvpBundle)
  fmcwBundleRef.current = fmcwMvpBundle

  const scenarioSummaryReport = useMemo(
    () =>
      buildScenarioSummaryReport({
        enemyMbtEntityCount: DUMMY_SCENARIO_ENTITIES.filter(
          (e) => e.relation === 'ENEMY' && e.kind === 'MBT',
        ).length,
        fmcwZoneLabel: fmcwMvpBundle.zoneLabel,
        fmcwIngressSummary: fmcwMvpBundle.ingressSummary,
        fmcwDetectionRangeKm: fmcwMvpBundle.detectionRangeKm,
        fmcwStrikeCapable: fmcwMvpBundle.engagements.filter((e) => e.strikeCapable).length,
        fmcwEngagementCount: fmcwMvpBundle.engagements.length,
      }),
    [fmcwMvpBundle],
  )

  const fmcwSummarySnapshot = useMemo(() => {
    let riskZoneCount = 0
    const riskZoneEstimates: Array<{
      riskScore: number
      targetCount: number
      probabilityPct: number
      etaMin: number | null
    }> = []
    const shortestRiskZoneEstimates: Array<{
      riskScore: number
      targetCount: number
      probabilityPct: number
      etaMin: number | null
    }> = []
    const framePredictedLines: Array<{ label: string; bearingDeg: number; lengthKm: number }> = []
    for (const feature of groundRadarVodAnalytics.geojson.features) {
      if (feature.properties.kind === 'risk_3') {
        riskZoneCount += 1
        const riskScore = Number(feature.properties.riskScore)
        const targetCount = Number(feature.properties.targetCount)
        const probabilityPct = Number(feature.properties.probabilityPct)
        const etaMinRaw = Number(feature.properties.etaMin)
        riskZoneEstimates.push({
          riskScore: Number.isFinite(riskScore) ? riskScore : 0,
          targetCount: Number.isFinite(targetCount) ? targetCount : 0,
          probabilityPct: Number.isFinite(probabilityPct) ? probabilityPct : 0,
          etaMin: Number.isFinite(etaMinRaw) ? etaMinRaw : null,
        })
      }
      if (feature.properties.kind === 'risk_5') {
        const riskScore = Number(feature.properties.riskScore)
        const targetCount = Number(feature.properties.targetCount)
        const probabilityPct = Number(feature.properties.probabilityPct)
        const etaMinRaw = Number(feature.properties.etaMin)
        shortestRiskZoneEstimates.push({
          riskScore: Number.isFinite(riskScore) ? riskScore : 0,
          targetCount: Number.isFinite(targetCount) ? targetCount : 0,
          probabilityPct: Number.isFinite(probabilityPct) ? probabilityPct : 0,
          etaMin: Number.isFinite(etaMinRaw) ? etaMinRaw : null,
        })
      }
      if (feature.properties.kind === 'axis_main_3') {
        const geometry = feature.geometry as { type?: string; coordinates?: unknown }
        if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) continue
        const coords = geometry.coordinates as Array<[number, number]>
        if (coords.length < 2) continue
        const from = coords[0]!
        const to = coords[coords.length - 1]!
        framePredictedLines.push({
          label: String(feature.properties.enemyName ?? '적 추정 객체'),
          bearingDeg: bearingDeg(from[1], from[0], to[1], to[0]),
          lengthKm: haversineKm({ lat: from[1], lng: from[0] }, { lat: to[1], lng: to[0] }),
        })
      }
    }
    const strikeCapableAssets = fmcwMvpBundle.engagements
      .filter((row) => row.strikeCapable)
      .map((row) => row.assetName)
    const pointEstimatedEnemiesRaw = scenarioEntitiesResolved
      .filter(
        (entity) =>
          entity.relation === 'ENEMY' &&
          entity.kind === 'MBT' &&
          GROUND_RADAR_SITES.some((site) => isPointInsideGroundRadarSector(site, entity)),
      )
      .map((entity) => ({
        name: formatScenarioEnemyCompact(entity),
        headingDeg: entity.headingDeg,
        speedKph: entity.speedKph,
        riskLevel: entity.riskLevel,
        mgrs: latLngToMgrsSafe(entity.lat, entity.lng),
        lat: entity.lat,
        lng: entity.lng,
      }))
    const pointEstimatedEnemies = pointEstimatedEnemiesRaw.map((enemy) => ({
      name: enemy.name,
      headingDeg: enemy.headingDeg,
      speedKph: enemy.speedKph,
      riskLevel: enemy.riskLevel,
      mgrs: enemy.mgrs,
    }))
    const bevByRadar = GROUND_RADAR_SITES.map((site) => {
      const points = pointEstimatedEnemiesRaw
        .filter((enemy) => isPointInsideGroundRadarSector(site, enemy))
        .map((enemy) => {
          const local = projectPointToRadarLocalKm(
            { lat: site.lat, lng: site.lng, headingDeg: site.headingDeg },
            enemy,
          )
          return {
            name: enemy.name,
            xKm: local.xKm,
            yKm: local.yKm,
            speedKph: enemy.speedKph,
            riskLevel: enemy.riskLevel,
            headingDeg: enemy.headingDeg,
          }
        })
      const rangeForBevKm = Math.max(12, site.rangeKm)
      const halfFovRad = (site.fovDeg * Math.PI) / 360
      const sectorHalfWidthKm = Math.max(10, rangeForBevKm * Math.sin(halfFovRad))
      const bevMaxForwardKm = Math.max(
        rangeForBevKm,
        ...points.map((point) => point.xKm + 2),
      )
      const bevHalfWidthKm = Math.max(
        sectorHalfWidthKm,
        ...points.map((point) => Math.abs(point.yKm) + 1.2),
      )
      return {
        radarId: site.id,
        radarName: site.name,
        axisLabel: site.axisLabel,
        points: points.slice(0, 10),
        pointCount: points.length,
        bevMaxForwardKm,
        bevHalfWidthKm,
      }
    })
    const shortestPredictedLines = groundRadarVodAnalytics.geojson.features
      .filter((feature) => feature.properties.kind === 'axis_main_5')
      .map((feature) => {
        const bearing = Number(feature.properties.bearingDeg)
        const lengthKm = Number(feature.properties.predictedLengthKm)
        return {
          label: String(feature.properties.enemyName ?? '적 추정 객체'),
          bearingDeg: Number.isFinite(bearing) ? bearing : 0,
          lengthKm: Number.isFinite(lengthKm) ? lengthKm : 0,
        }
      })
      .slice(0, 3)
    const frameDominantBearingDeg =
      framePredictedLines.length > 0
        ? framePredictedLines.reduce((sum, row) => sum + row.bearingDeg, 0) / framePredictedLines.length
        : null
    const shortestDominantBearingDeg =
      shortestPredictedLines.length > 0
        ? shortestPredictedLines.reduce((sum, row) => sum + row.bearingDeg, 0) /
          shortestPredictedLines.length
        : null

    const shortestRiskZoneCount = shortestRiskZoneEstimates.length
    const shortestIngressLengthKm =
      shortestPredictedLines.length > 0
        ? shortestPredictedLines.reduce((sum, line) => sum + line.lengthKm, 0) /
          shortestPredictedLines.length
        : null
    const sortedRiskZoneEstimates = [...riskZoneEstimates].sort((a, b) => b.riskScore - a.riskScore)
    const sortedShortestRiskZoneEstimates = [...shortestRiskZoneEstimates].sort(
      (a, b) => b.riskScore - a.riskScore,
    )
    const frameTopRisk = sortedRiskZoneEstimates[0] ?? null
    const shortestTopRisk = sortedShortestRiskZoneEstimates[0] ?? null

    return {
      detectedCount: groundRadarVodAnalytics.detectedCount,
      clusterCount: groundRadarVodAnalytics.clusterCount,
      riskZoneCount,
      strikeCapableCount: strikeCapableAssets.length,
      strikeCapableAssetNames: strikeCapableAssets.slice(0, 3),
      pointEstimateCount: pointEstimatedEnemies.length,
      pointEstimatedEnemies: pointEstimatedEnemies.slice(0, 3),
      framePredictedLines: framePredictedLines.slice(0, 3),
      frameDominantBearingDeg,
      shortestPredictedLines,
      shortestDominantBearingDeg,
      shortestRiskZoneCount,
      shortestIngressLengthKm,
      bevByRadar,
      riskZoneEstimates: sortedRiskZoneEstimates.slice(0, 3),
      shortestRiskZoneEstimates: sortedShortestRiskZoneEstimates.slice(0, 3),
      frameTopRisk,
      shortestTopRisk,
    }
  }, [fmcwMvpBundle, groundRadarVodAnalytics, scenarioEntitiesResolved])

  const activeFmcwBev = useMemo(() => {
    const rows = fmcwSummarySnapshot.bevByRadar
    if (rows.length === 0) return null
    return rows.find((row) => row.radarId === fmcwBevRadarId) ?? rows[0]!
  }, [fmcwBevRadarId, fmcwSummarySnapshot])

  const activeFmcwBevPointInfos = useMemo(() => {
    if (!activeFmcwBev) return []
    return activeFmcwBev.points
      .map((point) => {
        const distanceKm = Math.sqrt(point.xKm ** 2 + point.yKm ** 2)
        const relativeBearingDeg = (Math.atan2(point.yKm, Math.max(1e-6, point.xKm)) * 180) / Math.PI
        return {
          ...point,
          distanceKm,
          relativeBearingDeg,
        }
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [activeFmcwBev])

  const activeFmcwBevStats = useMemo(() => {
    if (activeFmcwBevPointInfos.length === 0) {
      return { nearestKm: null, farthestKm: null, avgDistanceKm: null, avgSpeedKph: null }
    }
    const nearestKm = activeFmcwBevPointInfos[0]?.distanceKm ?? null
    const farthestKm = activeFmcwBevPointInfos[activeFmcwBevPointInfos.length - 1]?.distanceKm ?? null
    const avgDistanceKm =
      activeFmcwBevPointInfos.reduce((sum, point) => sum + point.distanceKm, 0) / activeFmcwBevPointInfos.length
    const avgSpeedKph =
      activeFmcwBevPointInfos.reduce((sum, point) => sum + point.speedKph, 0) / activeFmcwBevPointInfos.length
    return { nearestKm, farthestKm, avgDistanceKm, avgSpeedKph }
  }, [activeFmcwBevPointInfos])

  const clearSarLossMapNotice = useCallback(() => {
    if (sarLossNoticeStartTimerRef.current != null) {
      window.clearTimeout(sarLossNoticeStartTimerRef.current)
      sarLossNoticeStartTimerRef.current = null
    }
    if (sarLossNoticeTimerRef.current != null) {
      window.clearTimeout(sarLossNoticeTimerRef.current)
      sarLossNoticeTimerRef.current = null
    }
    if (sarLossNoticePopupRef.current) {
      sarLossNoticePopupRef.current.remove()
      sarLossNoticePopupRef.current = null
    }
  }, [])

  const applyHamhungSarVisuals = useCallback((focusEntity?: ScenarioEntity) => {
    const raw = focusEntity ?? DUMMY_SCENARIO_ENTITIES.find((entity) => entity.id === 9002)
    setSarZoneProbabilities(null)
    setScenarioNotice(
      `${BATTLEFIELD_SCENARIO_NOTICES.enterSarScan} 지도 뷰는 GRD 이동 픽셀 후보(파란 클러스터)가 모두 들어오도록 맞춥니다. 파란 영역을 호버하거나 클릭하면 분류·거리·출동 조건을 확인할 수 있고, 클릭 시 우측 패널에도 요약이 표시됩니다.`,
    )
    const map = mapRef.current
    if (map) {
      const gb = computeGrdMotionDetectionsBounds()
      map.fitBounds(
        [
          [gb.west, gb.south],
          [gb.east, gb.north],
        ],
        {
          // SAR 전개 직후 시점을 약간 좌하단으로 이동(적/아군 동시 가시성 개선)
          padding: { top: 130, bottom: 70, left: 60, right: 220 },
          duration: 1000,
          maxZoom: 6.7,
        },
      )
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
      enemyScenarioPopupPinnedRef.current = false
    }
    if (!raw) return
    const pose = enemyBattlefieldPosesRef.current[raw.id]
    const target = pose ? { ...raw, lat: pose.lat, lng: pose.lng } : raw
    setSelectedDetail({
      title: getEnemyDisplayName(target.enemyCategory, target.confidence),
      affiliation: '적',
      lat: target.lat,
      lng: target.lng,
      mgrs: latLngToMgrsSafe(target.lat, target.lng),
      unitCode: resolveScenarioEnemyTrackDigits({
        ...target,
        unitCode: buildScenarioEntityUnitCode(target),
      }),
      summary: '함흥 남하 축선에서 SAR-2 관측 지역 내 적 전차가 발견되었습니다.',
      speedKph: target.speedKph,
      headingDeg: target.headingDeg,
      riskLevel: target.riskLevel,
    })
    setDroneStrikeTarget({
      lat: target.lat,
      lng: target.lng,
      name: formatScenarioEnemyCompact(target),
    })
    setDroneStrikeEntityId(raw.id)
    setTacticScores(getTacticScoresForEnemy(target))
  }, [])

  const enterSarScanPhase = useCallback(
    (focusEntity?: ScenarioEntity) => {
      setScenarioPhase(BattlefieldScenarioPhase.SAR_SCAN)
      setSensorState((prev) => ({
        ...prev,
        sar: { running: true, index: prev.sar.index },
      }))
      applyHamhungSarVisuals(focusEntity)
    },
    [applyHamhungSarVisuals],
  )

  const selectOperationRegion = useCallback(() => {
    setEnemyMarchSession((s) => s + 1)
    setScenarioPhase(BattlefieldScenarioPhase.REGION_SELECTED)
    setScenarioNotice(BATTLEFIELD_SCENARIO_NOTICES.regionSelected)
    const map = mapRef.current
    if (map) {
      map.fitBounds(
        [
          [KOREA_OPS_BOUNDS.west, KOREA_OPS_BOUNDS.south],
          [KOREA_OPS_BOUNDS.east, KOREA_OPS_BOUNDS.north],
        ],
        { padding: 60, duration: 650, maxZoom: 7.4 },
      )
    }
  }, [])

  const selectOperationRegionRef = useRef(selectOperationRegion)
  selectOperationRegionRef.current = selectOperationRegion

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: GOOGLE_SATELLITE_STYLE,
      center: BATTLEFIELD_SERVICE_MAP_INITIAL_CENTER,
      zoom: BATTLEFIELD_SERVICE_MAP_INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      /** 위에서 내려다보는 정면 시점 유지(사용자가 기울이지 못하도록 상한 0) */
      maxPitch: 0,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    let popupActionClickHandler: ((event: MouseEvent) => void) | null = null

    map.on('load', () => {
      const presetIds = Object.keys(GOOGLE_BASE_PRESETS) as GoogleBasePresetId[]
      for (const presetId of presetIds) {
        const preset = GOOGLE_BASE_PRESETS[presetId]
        if (!map.getSource(preset.sourceId)) {
          map.addSource(preset.sourceId, {
            type: 'raster',
            tiles: [GOOGLE_BASE_SOURCE_TILES[presetId]],
            tileSize: 256,
            attribution: 'Google',
            maxzoom: 21,
          })
        }
        if (!map.getLayer(preset.layerId)) {
          map.addLayer({
            id: preset.layerId,
            type: 'raster',
            source: preset.sourceId,
            minzoom: 0,
            maxzoom: 22,
            layout: {
              visibility: presetId === baseMapPreset ? 'visible' : 'none',
            },
          })
        }
      }

      if (!map.getSource(SERVICE_GRD_MOTION_SOURCE_ID)) {
        map.addSource(SERVICE_GRD_MOTION_SOURCE_ID, {
          type: 'geojson',
          data: GRD_MOTION_DETECTIONS_GEOJSON,
        })
      }
      if (!map.getLayer(SERVICE_GRD_MOTION_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GRD_MOTION_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_GRD_MOTION_SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': [
              'match',
              ['coalesce', ['get', 'classLabel'], ''],
              '전차',
              '#ef4444',
              '차량',
              '#2563eb',
              '일반 차량',
              '#2563eb',
              '#2563eb',
            ],
            'fill-opacity': 0.52,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GRD_MOTION_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GRD_MOTION_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_GRD_MOTION_SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              '#f8fafc',
              [
                'match',
                ['coalesce', ['get', 'classLabel'], ''],
                '전차',
                'rgba(239,68,68,0.88)',
                '차량',
                'rgba(37,99,235,0.72)',
                '일반 차량',
                'rgba(37,99,235,0.72)',
                'rgba(37,99,235,0.72)',
              ],
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              2.8,
              1,
            ],
            'line-opacity': 0.92,
          },
          layout: {
            visibility: 'none',
          },
        })
      }

      if (!map.getSource(SERVICE_ASSETS_SOURCE_ID)) {
        map.addSource(SERVICE_ASSETS_SOURCE_ID, {
          type: 'geojson',
          data: toMapSourceData(assetsRef.current),
          cluster: true,
          clusterMaxZoom: SERVICE_ASSETS_CLUSTER_MAX_ZOOM,
          clusterRadius: SERVICE_ASSETS_CLUSTER_RADIUS,
        })
      }
      if (!map.getSource(SERVICE_ASSETS_SYMBOL_SOURCE_ID)) {
        map.addSource(SERVICE_ASSETS_SYMBOL_SOURCE_ID, {
          type: 'geojson',
          data: toMapSourceData(assetsRef.current),
          // 심볼도 동일 기준으로 묶어 겹침 구간은 클러스터(개수)로 표기
          cluster: true,
          clusterMaxZoom: SERVICE_ASSETS_CLUSTER_MAX_ZOOM,
          clusterRadius: SERVICE_ASSETS_CLUSTER_RADIUS,
        })
      }
      ensureServiceAssetSymbolImages(map)
      ensureScenarioEnemySymbolImage(map)
      if (!map.getLayer(SERVICE_ASSETS_CLUSTER_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ASSETS_CLUSTER_LAYER_ID,
          type: 'circle',
          source: SERVICE_ASSETS_SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#22d3ee',
            'circle-radius': ['step', ['get', 'point_count'], 16, 8, 20, 20, 26],
            'circle-opacity': 0.72,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ecfeff',
          },
        })
      }
      if (!map.getLayer(SERVICE_ASSETS_CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ASSETS_CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: SERVICE_ASSETS_SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': '#e2e8f0',
          },
        })
      }
      if (!map.getLayer(SERVICE_ASSETS_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ASSETS_LAYER_ID,
          type: 'circle',
          source: SERVICE_ASSETS_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': [
              'match',
              ['get', 'category'],
              'GROUND_RADAR',
              7.8,
              'DIVISION',
              7.5,
              'UPPER_COMMAND',
              8.5,
              6.2,
            ],
            'circle-color': [
              'match',
              ['get', 'category'],
              'SAR',
              SERVICE_CATEGORY_COLOR.SAR,
              'UAV',
              SERVICE_CATEGORY_COLOR.UAV,
              'DRONE',
              SERVICE_CATEGORY_COLOR.DRONE,
              'GROUND_RADAR',
              SERVICE_CATEGORY_COLOR.GROUND_RADAR,
              'DIVISION',
              SERVICE_CATEGORY_COLOR.DIVISION,
              'UPPER_COMMAND',
              SERVICE_CATEGORY_COLOR.UPPER_COMMAND,
              'ARTILLERY',
              SERVICE_CATEGORY_COLOR.ARTILLERY,
              'ARMOR',
              SERVICE_CATEGORY_COLOR.ARMOR,
              '#f8fafc',
            ],
            'circle-stroke-width': 1.3,
            'circle-stroke-color': '#0b1220',
          },
        })
      }
      if (!map.getLayer(SERVICE_ASSETS_SYMBOL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ASSETS_SYMBOL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_ASSETS_SYMBOL_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': [
              'match',
              ['get', 'category'],
              'SAR',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.SAR,
              'UAV',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.UAV,
              'DRONE',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.DRONE,
              'GROUND_RADAR',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.GROUND_RADAR,
              'DIVISION',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.DIVISION,
              'UPPER_COMMAND',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.UPPER_COMMAND,
              'ARTILLERY',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.ARTILLERY,
              'ARMOR',
              SERVICE_ASSET_SYMBOL_IMAGE_ID.ARMOR,
              SERVICE_ASSET_SYMBOL_IMAGE_ID.DIVISION,
            ],
            'icon-size': SERVICE_FRIENDLY_SYMBOL_ICON_SIZE,
            'icon-offset': SERVICE_FRIENDLY_SYMBOL_ICON_OFFSET,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })
      }
      if (map.getLayer(SERVICE_ASSETS_SYMBOL_LAYER_ID)) {
        map.setLayoutProperty(
          SERVICE_ASSETS_SYMBOL_LAYER_ID,
          'icon-size',
          SERVICE_FRIENDLY_SYMBOL_ICON_SIZE,
        )
        map.setLayoutProperty(
          SERVICE_ASSETS_SYMBOL_LAYER_ID,
          'icon-offset',
          SERVICE_FRIENDLY_SYMBOL_ICON_OFFSET,
        )
      }
      if (!map.getLayer(SERVICE_ASSETS_LABEL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ASSETS_LABEL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_ASSETS_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'text-field': [
              'concat',
              ['get', 'name'],
              '\n식별번호 ',
              ['to-string', ['coalesce', ['get', 'unitCode'], '-']],
            ],
            'text-size': 12.2,
            'text-offset': [0, 2.18],
            'text-line-height': 1.08,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#020617',
            'text-halo-width': 1.4,
          },
        })
      }

      if (!map.getSource(SERVICE_MOVERS_SOURCE_ID)) {
        map.addSource(SERVICE_MOVERS_SOURCE_ID, { type: 'geojson', data: toMapSourceData([]) })
      }
      if (!map.getLayer(SERVICE_MOVERS_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_MOVERS_LAYER_ID,
          type: 'circle',
          source: SERVICE_MOVERS_SOURCE_ID,
          paint: {
            'circle-radius': [
              'match',
              ['get', 'category'],
              'MOVING_DRONE',
              12.5,
              'MOVING_FMCW_ENEMY',
              9.8,
              'MOVING_UAV_TARGET',
              8.8,
              'MOVING_UAV',
              10,
              9,
            ],
            'circle-color': [
              'match',
              ['get', 'category'],
              'MOVING_UAV',
              '#38bdf8',
              'MOVING_UAV_TARGET',
              '#f97316',
              'MOVING_DRONE',
              '#c026d3',
              'MOVING_FMCW',
              '#c084fc',
              'MOVING_FMCW_ENEMY',
              '#f43f5e',
              '#f97316',
            ],
            'circle-stroke-width': [
              'match',
              ['get', 'category'],
              'MOVING_DRONE',
              3,
              2,
            ],
            'circle-stroke-color': [
              'match',
              ['get', 'category'],
              'MOVING_UAV',
              '#bae6fd',
              'MOVING_UAV_TARGET',
              '#ffedd5',
              'MOVING_DRONE',
              '#fae8ff',
              'MOVING_FMCW',
              '#e9d5ff',
              'MOVING_FMCW_ENEMY',
              '#fecdd3',
              '#fdba74',
            ],
            'circle-opacity': [
              'match',
              ['get', 'category'],
              'MOVING_DRONE',
              0.95,
              'MOVING_FMCW_ENEMY',
              0.95,
              1,
            ],
          },
        })
      }
      if (!map.getLayer(SERVICE_MOVERS_LABEL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_MOVERS_LABEL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_MOVERS_SOURCE_ID,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'text-offset': [0, 1.5],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': [
              'match',
              ['get', 'category'],
              'MOVING_UAV_TARGET',
              '#fff7ed',
              'MOVING_UAV',
              '#e0f2fe',
              'MOVING_DRONE',
              '#fae8ff',
              'MOVING_FMCW',
              '#f3e8ff',
              'MOVING_FMCW_ENEMY',
              '#ffe4e6',
              '#fef3c7',
            ],
            'text-halo-color': [
              'match',
              ['get', 'category'],
              'MOVING_UAV_TARGET',
              '#7c2d12',
              'MOVING_DRONE',
              '#4a044e',
              'MOVING_UAV',
              '#0c4a6e',
              'MOVING_FMCW_ENEMY',
              '#881337',
              '#7c2d12',
            ],
            'text-halo-width': 1.1,
          },
        })
      }

      if (!map.getSource(SERVICE_SCENARIO_SOURCE_ID)) {
        map.addSource(SERVICE_SCENARIO_SOURCE_ID, {
          type: 'geojson',
          data: toMapSourceData(
            DUMMY_SCENARIO_ENTITIES.filter((entity) => scenarioMbtEnemyVisibleOnMap(entity, {})).map(
              (entity) => scenarioEntityToGeoJsonProperties(entity),
            ),
          ),
        })
      }

      if (!map.getLayer(SERVICE_ENEMY_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ENEMY_LAYER_ID,
          type: 'circle',
          source: SERVICE_SCENARIO_SOURCE_ID,
          filter: ['==', ['get', 'relation'], 'ENEMY'],
          paint: {
            'circle-radius': 7.2,
            'circle-color': '#f43f5e',
            'circle-stroke-width': 1.8,
            'circle-stroke-color': '#ffe4e6',
          },
        })
      }
      if (!map.getLayer(SERVICE_SCENARIO_ENEMY_SYMBOL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_SCENARIO_ENEMY_SYMBOL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_SCENARIO_SOURCE_ID,
          filter: ['all', ['==', ['get', 'relation'], 'ENEMY'], ['==', ['get', 'kind'], 'MBT']],
          layout: {
            'icon-image': SERVICE_SCENARIO_ENEMY_SYMBOL_IMAGE_ID,
            'icon-size': SERVICE_ASSET_SYMBOL_ICON_SIZE,
            'icon-offset': [0, -1.28],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })
      }
      if (!map.getLayer(SERVICE_ALLY_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ALLY_LAYER_ID,
          type: 'circle',
          source: SERVICE_SCENARIO_SOURCE_ID,
          filter: ['==', ['get', 'relation'], 'ALLY'],
          paint: {
            'circle-radius': 6.4,
            'circle-color': '#38bdf8',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#e0f2fe',
          },
        })
      }
      if (!map.getLayer(SERVICE_NEUTRAL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_NEUTRAL_LAYER_ID,
          type: 'circle',
          source: SERVICE_SCENARIO_SOURCE_ID,
          filter: ['==', ['get', 'relation'], 'NEUTRAL'],
          paint: {
            'circle-radius': 6.2,
            'circle-color': '#facc15',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fef9c3',
          },
        })
      }
      if (!map.getLayer(SERVICE_SCENARIO_LABEL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_SCENARIO_LABEL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_SCENARIO_SOURCE_ID,
          layout: {
            'text-field': [
              'step',
              ['zoom'],
              ['coalesce', ['get', 'scenario_label_compact'], ['get', 'name']],
              7.5,
              ['coalesce', ['get', 'scenario_label_multi'], ['get', 'name']],
            ],
            'text-size': 10,
            'text-line-height': 1.12,
            'text-offset': [0, 1.35],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': [
              'match',
              ['get', 'relation'],
              'ENEMY',
              '#fecdd3',
              'ALLY',
              '#bae6fd',
              'NEUTRAL',
              '#fef08a',
              '#e2e8f0',
            ],
            'text-halo-color': '#111827',
            'text-halo-width': 1.1,
          },
        })
      }

      if (!map.getSource(SERVICE_SAR2_ZONE_SOURCE_ID)) {
        map.addSource(SERVICE_SAR2_ZONE_SOURCE_ID, {
          type: 'geojson',
          data: SAR_OBSERVATION_ZONE_GEOJSON as Parameters<GeoJSONSource['setData']>[0],
        })
      }
      if (!map.getLayer(SERVICE_SAR2_ZONE_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_SAR2_ZONE_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_SAR2_ZONE_SOURCE_ID,
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.18,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_SAR2_ZONE_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_SAR2_ZONE_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_SAR2_ZONE_SOURCE_ID,
          paint: {
            'line-color': '#fecaca',
            'line-width': 2,
            'line-dasharray': [2, 1],
          },
          layout: {
            visibility: 'none',
          },
        })
      }

      if (!map.getSource(SERVICE_ENEMY_ROUTE_SOURCE_ID)) {
        map.addSource(SERVICE_ENEMY_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: SAR_ENEMY_MOVEMENT_ROUTE_GEOJSON as Parameters<GeoJSONSource['setData']>[0],
        })
      }
      if (!map.getLayer(SERVICE_ENEMY_ROUTE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ENEMY_ROUTE_LAYER_ID,
          type: 'line',
          source: SERVICE_ENEMY_ROUTE_SOURCE_ID,
          paint: {
            'line-color': '#fb7185',
            'line-width': 2.2,
            'line-opacity': 0.88,
            'line-dasharray': [1, 1.4],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_ENEMY_ROUTE_ALERT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ENEMY_ROUTE_ALERT_LAYER_ID,
          type: 'line',
          source: SERVICE_ENEMY_ROUTE_SOURCE_ID,
          paint: {
            'line-color': '#fde047',
            'line-width': 4.8,
            'line-opacity': 0.96,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_ENEMY_ROUTE_HIT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_ENEMY_ROUTE_HIT_LAYER_ID,
          type: 'line',
          source: SERVICE_ENEMY_ROUTE_SOURCE_ID,
          paint: {
            'line-color': '#000',
            'line-opacity': 0,
            'line-width': 18,
          },
          layout: {
            visibility: 'none',
          },
        })
      }

      if (!map.getSource(SERVICE_GROUND_RADAR_COVERAGE_SOURCE_ID)) {
        map.addSource(SERVICE_GROUND_RADAR_COVERAGE_SOURCE_ID, {
          type: 'geojson',
          data: buildGroundRadarCoverageGeojson(GROUND_RADAR_SITES),
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_COVERAGE_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_COVERAGE_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_GROUND_RADAR_COVERAGE_SOURCE_ID,
          filter: ['==', ['get', 'coverageKind'], 'boundary'],
          paint: {
            'fill-color': '#f59e0b',
            'fill-opacity': 0.16,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_COVERAGE_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_COVERAGE_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_COVERAGE_SOURCE_ID,
          filter: ['==', ['get', 'coverageKind'], 'boundary'],
          paint: {
            'line-color': '#fbbf24',
            'line-width': 2.4,
            'line-opacity': 0.92,
            'line-dasharray': [2.4, 1.5],
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_COVERAGE_SCAN_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_COVERAGE_SCAN_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_COVERAGE_SOURCE_ID,
          filter: ['==', ['get', 'coverageKind'], 'scanline'],
          paint: {
            'line-color': '#fde68a',
            'line-width': 1.8,
            'line-opacity': 0.9,
            'line-dasharray': [1.3, 1.2],
          },
          layout: {
            visibility: 'visible',
          },
        })
      }

      if (!map.getSource(SERVICE_GROUND_RADAR_VOD_SOURCE_ID)) {
        map.addSource(SERVICE_GROUND_RADAR_VOD_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_RISK_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_RISK_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk_3'],
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'riskScore'], 50],
              45,
              '#fde68a',
              65,
              '#fb923c',
              85,
              '#f43f5e',
            ],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'riskScore'], 50],
              45,
              0.1,
              65,
              0.16,
              85,
              0.26,
            ],
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_RISK_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_RISK_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk_3'],
          paint: {
            'line-color': '#fda4af',
            'line-width': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'riskScore'], 50],
              45,
              1.5,
              65,
              2.2,
              85,
              3.2,
            ],
            'line-opacity': 0.94,
            'line-dasharray': [2, 1.2],
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_RISK_LABEL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_RISK_LABEL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk_3'],
          layout: {
            'text-field': [
              'concat',
              'P',
              ['to-string', ['round', ['to-number', ['get', 'probabilityPct'], 0]]],
              '% · ',
              ['to-string', ['round', ['to-number', ['get', 'etaMin'], 0]]],
              'm',
            ],
            'text-size': 10,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': '#ffe4e6',
            'text-halo-color': '#7f1d1d',
            'text-halo-width': 1.1,
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_RISK_SHORTEST_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_RISK_SHORTEST_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk_5'],
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'riskScore'], 50],
              45,
              '#fed7aa',
              65,
              '#fb923c',
              85,
              '#ea580c',
            ],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'riskScore'], 50],
              45,
              0.12,
              65,
              0.2,
              85,
              0.3,
            ],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_RISK_SHORTEST_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_RISK_SHORTEST_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk_5'],
          paint: {
            'line-color': '#fdba74',
            'line-width': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'riskScore'], 50],
              45,
              1.8,
              65,
              2.6,
              85,
              3.5,
            ],
            'line-opacity': 0.94,
            'line-dasharray': [2.4, 1.4],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_RISK_SHORTEST_LABEL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_RISK_SHORTEST_LABEL_LAYER_ID,
          type: 'symbol',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk_5'],
          layout: {
            'text-field': [
              'concat',
              'P',
              ['to-string', ['round', ['to-number', ['get', 'probabilityPct'], 0]]],
              '% · ',
              ['to-string', ['round', ['to-number', ['get', 'etaMin'], 0]]],
              'm',
            ],
            'text-size': 10,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': '#ffedd5',
            'text-halo-color': '#7c2d12',
            'text-halo-width': 1.1,
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_CORRIDOR_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_CORRIDOR_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'corridor_3'],
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#f59e0b',
              '#f43f5e',
            ],
            'fill-opacity': 0.12,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_CORRIDOR_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_CORRIDOR_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'corridor_3'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#fbbf24',
              '#fb7185',
            ],
            'line-width': 1.6,
            'line-opacity': 0.82,
            'line-dasharray': [2.2, 1.6],
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_CORRIDOR_5_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_CORRIDOR_5_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'corridor_5'],
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#f59e0b',
              '#facc15',
            ],
            'fill-opacity': 0.12,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_CORRIDOR_5_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_CORRIDOR_5_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'corridor_5'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#fbbf24',
              '#fde047',
            ],
            'line-width': 1.6,
            'line-opacity': 0.82,
            'line-dasharray': [2.2, 1.6],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PAST_TRACK_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PAST_TRACK_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'predict_past_3'],
          paint: {
            'line-color': '#38bdf8',
            'line-width': 2.4,
            'line-opacity': 0.88,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PAST_POINT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PAST_POINT_LAYER_ID,
          type: 'circle',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'past_point_3'],
          paint: {
            'circle-radius': 3.8,
            'circle-color': '#7dd3fc',
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#082f49',
            'circle-opacity': 0.95,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PAST_TRACK_5_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PAST_TRACK_5_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'predict_past_5'],
          paint: {
            'line-color': '#60a5fa',
            'line-width': 2.6,
            'line-opacity': 0.9,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PAST_POINT_5_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PAST_POINT_5_LAYER_ID,
          type: 'circle',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'past_point_5'],
          paint: {
            'circle-radius': 3.8,
            'circle-color': '#93c5fd',
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#172554',
            'circle-opacity': 0.95,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_ALT_AXIS_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_ALT_AXIS_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'axis_alt_3'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#fbbf24',
              '#fda4af',
            ],
            'line-width': 1.7,
            'line-opacity': 0.9,
            'line-dasharray': [1.6, 1.5],
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_ALT_AXIS_5_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_ALT_AXIS_5_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'axis_alt_5'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#fbbf24',
              '#fde68a',
            ],
            'line-width': 1.7,
            'line-opacity': 0.9,
            'line-dasharray': [1.6, 1.5],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PREDICT_GLOW_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PREDICT_GLOW_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'axis_main_3'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#fbbf24',
              '#fda4af',
            ],
            'line-width': 7.8,
            'line-opacity': 0.2,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PREDICT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PREDICT_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'axis_main_3'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#f59e0b',
              '#f43f5e',
            ],
            'line-width': 3.7,
            'line-opacity': 0.96,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PREDICT_ENDPOINT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PREDICT_ENDPOINT_LAYER_ID,
          type: 'circle',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'future_point_3'],
          paint: {
            'circle-radius': 5.4,
            'circle-color': '#fb7185',
            'circle-stroke-width': 1.6,
            'circle-stroke-color': '#ffe4e6',
            'circle-opacity': 0.95,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PREDICT_SHORTEST_GLOW_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PREDICT_SHORTEST_GLOW_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'axis_main_5'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#fbbf24',
              '#fde68a',
            ],
            'line-width': 8.2,
            'line-opacity': 0.2,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PREDICT_SHORTEST_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PREDICT_SHORTEST_LAYER_ID,
          type: 'line',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'axis_main_5'],
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'overlapRisk'], true],
              '#f59e0b',
              '#fde047',
            ],
            'line-width': 3.7,
            'line-opacity': 0.96,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_PREDICT_SHORTEST_ENDPOINT_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_PREDICT_SHORTEST_ENDPOINT_LAYER_ID,
          type: 'circle',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'future_point_5'],
          paint: {
            'circle-radius': 5.8,
            'circle-color': '#facc15',
            'circle-stroke-width': 1.7,
            'circle-stroke-color': '#fef9c3',
            'circle-opacity': 0.96,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_GROUND_RADAR_DBSCAN_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_GROUND_RADAR_DBSCAN_LAYER_ID,
          type: 'circle',
          source: SERVICE_GROUND_RADAR_VOD_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'dbscan'],
          paint: {
            'circle-radius': 6.4,
            'circle-color': '#fb7185',
            'circle-stroke-width': 1.4,
            'circle-stroke-color': '#ffe4e6',
            'circle-opacity': 0.95,
          },
          layout: {
            visibility: 'visible',
          },
        })
      }

      if (!map.getSource(SERVICE_FMCW_RISK_SOURCE_ID)) {
        map.addSource(SERVICE_FMCW_RISK_SOURCE_ID, {
          type: 'geojson',
          data: FMCW_SCENARIO_GEOJSON,
        })
      }
      if (!map.getLayer(SERVICE_FMCW_RISK_FILL_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_FMCW_RISK_FILL_LAYER_ID,
          type: 'fill',
          source: SERVICE_FMCW_RISK_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk'],
          paint: {
            'fill-color': '#f97316',
            'fill-opacity': 0.16,
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_FMCW_RISK_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_FMCW_RISK_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_FMCW_RISK_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'risk'],
          paint: {
            'line-color': '#fdba74',
            'line-width': 2,
            'line-opacity': 0.88,
            'line-dasharray': [3, 2],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_FMCW_INGRESS_LINE_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_FMCW_INGRESS_LINE_LAYER_ID,
          type: 'line',
          source: SERVICE_FMCW_RISK_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'ingress'],
          paint: {
            'line-color': '#fb923c',
            'line-width': 2.8,
            'line-opacity': 0.92,
            'line-dasharray': [1.2, 1.1],
          },
          layout: {
            visibility: 'none',
          },
        })
      }
      if (!map.getLayer(SERVICE_FMCW_TRACK_LAYER_ID)) {
        map.addLayer({
          id: SERVICE_FMCW_TRACK_LAYER_ID,
          type: 'circle',
          source: SERVICE_FMCW_RISK_SOURCE_ID,
          filter: ['==', ['get', 'kind'], 'track'],
          paint: {
            'circle-radius': 7,
            'circle-color': '#fb923c',
            'circle-opacity': 0.95,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff7ed',
          },
          layout: {
            visibility: 'none',
          },
        })
      }

      map.on('mouseenter', SERVICE_FMCW_RISK_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mousemove', SERVICE_FMCW_RISK_FILL_LAYER_ID, (event) => {
        const html = renderFmcwRiskPopupHtml(fmcwBundleRef.current)
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
          })
        }
        popupRef.current.setLngLat(event.lngLat).setHTML(html).addTo(map)
      })
      map.on('mouseleave', SERVICE_FMCW_RISK_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })

      map.on('mousemove', (event) => {
        const lat = event.lngLat.lat
        const lng = event.lngLat.lng
        setCursorReadout({
          lat,
          lng,
          mgrs: latLngToMgrsSafe(lat, lng),
        })
      })

      map.on('mouseenter', SERVICE_ASSETS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseenter', SERVICE_ASSETS_SYMBOL_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseenter', SERVICE_ASSETS_CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', SERVICE_ASSETS_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })
      map.on('mouseleave', SERVICE_ASSETS_SYMBOL_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })

      map.on('mouseleave', SERVICE_ASSETS_CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })

      map.on('click', SERVICE_ASSETS_CLUSTER_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const props = (feature.properties ?? {}) as Record<string, unknown>
        const clusterId = Number(props.cluster_id)
        if (!Number.isFinite(clusterId)) return
        const source = map.getSource(SERVICE_ASSETS_SOURCE_ID)
        if (!source) return
        const geometry = feature.geometry as { coordinates?: unknown }
        const coordinates = geometry.coordinates
        if (!Array.isArray(coordinates)) return

        const clusterSource = source as GeoJSONSource & {
          getClusterExpansionZoom: (
            clusterId: number,
            callback: (error: Error | null, zoom: number) => void,
          ) => void
        }
        clusterSource.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return
          map.easeTo({
            center: [Number(coordinates[0]), Number(coordinates[1])],
            zoom,
            duration: 450,
          })
        })
      })

      const handleAssetLayerMouseMove = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0]
        if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return

        const props = (feature.properties ?? {}) as Record<string, unknown>
        const geometry = feature.geometry as { coordinates?: unknown }
        const coordinates = geometry.coordinates
        const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : Number(props.lng)
        const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : Number(props.lat)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        const cat = String(props.category ?? '')
        const idNum = Number(props.id)
        const html = renderServiceAssetPopupHtml({
          name: String(props.name ?? ''),
          category: cat,
          lat,
          lng,
          unitCode: resolveUnitCodeForGeoJsonPoint({
            id: Number.isFinite(idNum) ? idNum : 0,
            category: cat,
            unitCode: props.unitCode != null ? String(props.unitCode) : '',
          }),
          level: String(props.level ?? ''),
          formation: String(props.formation ?? ''),
          elevationM:
            props.elevationM == null || props.elevationM === ''
              ? null
              : Number(props.elevationM),
          mgrs: String(props.mgrs ?? ''),
          readiness: String(props.readiness ?? ''),
          mission: String(props.mission ?? ''),
        })

        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
          })
        }
        popupRef.current.setLngLat([lng, lat]).setHTML(html).addTo(map)
      }
      map.on('mousemove', SERVICE_ASSETS_LAYER_ID, handleAssetLayerMouseMove)
      map.on('mousemove', SERVICE_ASSETS_SYMBOL_LAYER_ID, handleAssetLayerMouseMove)

      map.on('mouseenter', SERVICE_MOVERS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mousemove', SERVICE_MOVERS_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return
        const props = (feature.properties ?? {}) as Record<string, unknown>
        const cat = String(props.category ?? '')
        const geometry = feature.geometry as { coordinates?: unknown }
        const coordinates = geometry.coordinates
        const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : Number(props.lng)
        const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : Number(props.lat)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        if (cat === 'MOVING_UAV') {
          const path = sensorPathsRef.current.uav
          const st = sensorStateRef.current.uav
          const headingDegEst = uavSimHeadingForPopup(
            lat,
            lng,
            uavChasingEnemyIdRef.current,
            uavGrdMissionRef.current,
            enemyBattlefieldPosesRef.current,
          )
          const snap = buildUavMvpSnapshot({
            lat,
            lng,
            mgrs: latLngToMgrsSafe(lat, lng),
            pathLength: Math.max(1, path.length),
            pathIndex: st.index,
            running: st.running,
            phaseAtLeastUav: phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.UAV_DISPATCHED),
            headingDegEst,
            platformOverride:
              activeDispatchedUavRef.current == null
                ? undefined
                : {
                    callSign: activeDispatchedUavRef.current.name,
                    platformId: activeDispatchedUavRef.current.equipment ?? undefined,
                    eoIrNote: activeDispatchedUavRef.current.equipment ?? undefined,
                    sarFollowupLine: `${activeDispatchedUavRef.current.mission} · 준비태세 ${activeDispatchedUavRef.current.readiness}`,
                  },
          })
          const html = renderUavMvpPopupHtml(snap)
          if (!popupRef.current) {
            popupRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 14,
            })
          }
          popupRef.current.setLngLat([lng, lat]).setHTML(html).addTo(map)
          return
        }

        if (cat === 'MOVING_DRONE') {
          const path = sensorPathsRef.current.drone
          const st = sensorStateRef.current.drone
          const snap = snapshotDroneMvpForBattlefieldService(
            {
              lat,
              lng,
              mgrs: latLngToMgrsSafe(lat, lng),
              pathLength: Math.max(1, path.length),
              pathIndex: st.index,
              running: st.running,
              phaseAtLeastDrone: phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.DRONE_RECON),
            },
            { strikeTarget: droneStrikeTargetRef.current },
            scenarioEntitiesResolvedRef.current,
          )
          const html = renderDroneMvpPopupHtml(snap)
          if (!popupRef.current) {
            popupRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 14,
            })
          }
          popupRef.current.setLngLat([lng, lat]).setHTML(html).addTo(map)
          return
        }

        if (cat === 'MOVING_FMCW_ENEMY') {
          const headingDeg = Number(props.headingDeg)
          const speedKph = Number(props.speedKph)
          const html = renderFmcwEstimatedEnemyPopupHtml({
            pointName: String(props.name ?? 'FMCW 추정점'),
            targetName: String(props.mission ?? '적 객체 추정'),
            lat,
            lng,
            mgrs: latLngToMgrsSafe(lat, lng),
            headingDeg: Number.isFinite(headingDeg) ? headingDeg : undefined,
            speedKph: Number.isFinite(speedKph) ? speedKph : undefined,
            riskLevel: String(props.riskLevel ?? '중간'),
            ingressSummary: fmcwBundleRef.current.ingressSummary,
          })
          if (!popupRef.current) {
            popupRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 14,
            })
          }
          popupRef.current.setLngLat([lng, lat]).setHTML(html).addTo(map)
          return
        }

        const moverName = String(props.name ?? '센서 이동')
        const simple = `
          <div class="service-asset-popup">
            <h4 class="service-asset-popup__title">${escapeHtml(moverName)}</h4>
            <p class="muted" style="margin:0;font-size:12px;">시나리오 센서 궤적</p>
          </div>`
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
          })
        }
        popupRef.current.setLngLat([lng, lat]).setHTML(simple).addTo(map)
      })
      map.on('mouseleave', SERVICE_MOVERS_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })

      map.on('click', SERVICE_MOVERS_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const props = (feature.properties ?? {}) as Record<string, unknown>
        const cat = String(props.category ?? '')
        const geometry = feature.geometry as { coordinates?: unknown }
        const coordinates = geometry.coordinates
        const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : Number(props.lng)
        const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : Number(props.lat)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        if (cat === 'MOVING_UAV') {
          const path = sensorPathsRef.current.uav
          const st = sensorStateRef.current.uav
          const headingDegEst = uavSimHeadingForPopup(
            lat,
            lng,
            uavChasingEnemyIdRef.current,
            uavGrdMissionRef.current,
            enemyBattlefieldPosesRef.current,
          )
          const snap = buildUavMvpSnapshot({
            lat,
            lng,
            mgrs: latLngToMgrsSafe(lat, lng),
            pathLength: Math.max(1, path.length),
            pathIndex: st.index,
            running: st.running,
            phaseAtLeastUav: phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.UAV_DISPATCHED),
            headingDegEst,
            platformOverride:
              activeDispatchedUavRef.current == null
                ? undefined
                : {
                    callSign: activeDispatchedUavRef.current.name,
                    platformId: activeDispatchedUavRef.current.equipment ?? undefined,
                    eoIrNote: activeDispatchedUavRef.current.equipment ?? undefined,
                    sarFollowupLine: `${activeDispatchedUavRef.current.mission} · 준비태세 ${activeDispatchedUavRef.current.readiness}`,
                  },
          })
          setTacticScores(null)
          setSelectedAssetId(null)
          setActiveCategory(null)
          setSelectedDetail({
            title: snap.callSign,
            affiliation: '아군',
            lat,
            lng,
            mgrs: snap.mgrs,
            summary: snap.sarFollowupLine,
            speedKph: snap.speedKphEst,
            headingDeg: snap.headingDegEst,
            uavMvp: snap,
          })
          openUavVideoModal({
            title: `${activeDispatchedUavRef.current?.name ?? snap.callSign} EO/IR 영상`,
            subtitle: '출동 UAV 실시간 EO/IR 피드',
            videoUrl: BATTLEFIELD_UAV_CLICK_VIDEO_URL,
          })
          return
        }

        if (cat === 'MOVING_DRONE') {
          const path = sensorPathsRef.current.drone
          const st = sensorStateRef.current.drone
          const forceEoIrFeed =
            st.running &&
            droneStrikeTargetRef.current != null &&
            phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.DRONE_RECON)
          const snap = snapshotDroneMvpForBattlefieldService(
            {
              lat,
              lng,
              mgrs: latLngToMgrsSafe(lat, lng),
              pathLength: Math.max(1, path.length),
              pathIndex: st.index,
              running: st.running,
              phaseAtLeastDrone: phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.DRONE_RECON),
            },
            {
              strikeTarget: droneStrikeTargetRef.current,
              forceEoIrFeed,
            },
            scenarioEntitiesResolvedRef.current,
          )
          setTacticScores(null)
          setSelectedAssetId(null)
          setActiveCategory(null)
          setSelectedDetail({
            title: snap.droneId,
            affiliation: '아군',
            lat,
            lng,
            mgrs: snap.mgrs,
            summary: snap.afterUavContextLine,
            speedKph: snap.speedKphEst,
            headingDeg: snap.headingDegEst,
            riskLevel: snap.threatLevel,
            droneMvp: snap,
          })
          return
        }

        if (cat === 'MOVING_FMCW_ENEMY') {
          const headingDeg = Number(props.headingDeg)
          const speedKph = Number(props.speedKph)
          const riskLevel = String(props.riskLevel ?? '중간')
          setTacticScores(null)
          setSelectedAssetId(null)
          setActiveCategory(null)
          setSelectedDetail({
            title: String(props.mission ?? props.name ?? 'FMCW 점 객체 추정'),
            affiliation: '적',
            lat,
            lng,
            mgrs: latLngToMgrsSafe(lat, lng),
            summary: `점 객체 추정 · 예상 이동 경로 ${fmcwBundleRef.current.ingressSummary}`,
            speedKph: Number.isFinite(speedKph) ? speedKph : undefined,
            headingDeg: Number.isFinite(headingDeg) ? headingDeg : undefined,
            riskLevel: riskLevel === '높음' || riskLevel === '중간' || riskLevel === '낮음' ? riskLevel : '중간',
          })
          return
        }
      })

      const handleAssetLayerClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0]
        if (!feature) return
        const props = (feature.properties ?? {}) as Record<string, unknown>
        const idNum = Number(props.id)
        const lat = Number(props.lat)
        const lng = Number(props.lng)
        if (!Number.isFinite(idNum) || !Number.isFinite(lat) || !Number.isFinite(lng)) return
        const category = String(props.category ?? '') as ServiceAssetCategory
        if (
          scenarioPhaseRef.current === BattlefieldScenarioPhase.REGION_SELECTED &&
          category === 'SAR'
        ) {
          setScenarioNotice(
            'SAR 단계 시뮬레이션은 좌측 「SAR」 버튼을 눌러 설명을 확인한 뒤 진행하세요. 지도에서 자산만 눌러서는 단계가 넘어가지 않습니다.',
          )
        }
        setActiveCategory(category)
        setSelectedAssetId(idNum)
        setTacticScores(null)
        const elevRaw = props.elevationM
        const elevationM =
          elevRaw == null || elevRaw === ''
            ? undefined
            : Number.isFinite(Number(elevRaw))
              ? Number(elevRaw)
              : undefined
        setSelectedDetail({
          title: String(props.name ?? ''),
          affiliation: '아군',
          lat,
          lng,
          mgrs: String(props.mgrs ?? latLngToMgrsSafe(lat, lng)),
          unitCode: resolveUnitCodeForGeoJsonPoint({
            id: idNum,
            category: String(props.category ?? ''),
            unitCode: props.unitCode != null ? String(props.unitCode) : '',
          }),
          summary: String(props.mission ?? '아군 자산 위치 정보'),
          elevationM,
        })
        if (category === 'UAV') {
          const rawVideoUrl = props.situationVideoUrl
          const videoUrl =
            typeof rawVideoUrl === 'string' && rawVideoUrl.trim().length > 0
              ? rawVideoUrl
              : BATTLEFIELD_UAV_CLICK_VIDEO_URL
          openUavVideoModal({
            title: `${String(props.name ?? 'UAV')} EO/IR 영상`,
            subtitle: 'UAV 자산 클릭 · 영상 팝업',
            videoUrl,
          })
        }
      }
      map.on('click', SERVICE_ASSETS_LAYER_ID, handleAssetLayerClick)
      map.on('click', SERVICE_ASSETS_SYMBOL_LAYER_ID, handleAssetLayerClick)

      const scenarioPointLayers = [SERVICE_ALLY_LAYER_ID, SERVICE_NEUTRAL_LAYER_ID] as const
      for (const lid of scenarioPointLayers) {
        map.on('mouseenter', lid, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', lid, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      const scenarioEnemyPickLayers = [SERVICE_ENEMY_LAYER_ID, SERVICE_SCENARIO_ENEMY_SYMBOL_LAYER_ID]
      const handleEnemyScenarioMouseMove = (event: MapLayerMouseEvent) => {
        if (enemyScenarioPopupPinnedRef.current) return
        const feature = event.features?.[0]
        if (!feature) return
        const idNum = Number((feature.properties ?? {}).id)
        const targetMeta = DUMMY_SCENARIO_ENTITIES.find((entity) => entity.id === idNum)
        if (!targetMeta) return
        const g = feature.geometry as { type?: string; coordinates?: unknown }
        const c = Array.isArray(g.coordinates) ? g.coordinates : null
        const lng = c && Number.isFinite(Number(c[0])) ? Number(c[0]) : targetMeta.lng
        const lat = c && Number.isFinite(Number(c[1])) ? Number(c[1]) : targetMeta.lat
        const target = { ...targetMeta, lat, lng }
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
          })
        }
        popupRef.current
          .setLngLat([target.lng, target.lat])
          .setHTML(renderScenarioEntityPopupHtml(target, target.lat, target.lng, 'summary'))
          .addTo(map)
      }
      const handleEnemyScenarioMouseLeave = () => {
        map.getCanvas().style.cursor = ''
        if (enemyScenarioPopupPinnedRef.current) return
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      }
      const handleEnemyScenarioClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0]
        if (!feature) return
        const idNum = Number((feature.properties ?? {}).id)
        const targetMeta = DUMMY_SCENARIO_ENTITIES.find((entity) => entity.id === idNum)
        if (!targetMeta) return
        const g = feature.geometry as { type?: string; coordinates?: unknown }
        const c = Array.isArray(g.coordinates) ? g.coordinates : null
        const lng = c && Number.isFinite(Number(c[0])) ? Number(c[0]) : targetMeta.lng
        const lat = c && Number.isFinite(Number(c[1])) ? Number(c[1]) : targetMeta.lat
        const target = { ...targetMeta, lat, lng }
        const ph = scenarioPhaseRef.current
        const unitCode = buildScenarioEntityUnitCode(targetMeta)
        const trackDigits = resolveScenarioEnemyTrackDigits({ ...target, unitCode })
        const enemySummary = `${target.kind} · ${getEnemyStatusLabel(target.detectionStatus)} · ${target.status}`
        const openEnemyClickScenarioPopup = () => {
          enemyScenarioPopupPinnedRef.current = true
          if (!popupRef.current) {
            popupRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 14,
            })
          }
          popupRef.current
            .setLngLat([target.lng, target.lat])
            .setHTML(renderScenarioEntityPopupHtml(target, target.lat, target.lng, 'full'))
            .addTo(map)
        }
        launchDroneFromEnemyClick({
          id: target.id,
          kind: target.kind,
          name: formatScenarioEnemyCompact(target),
          lat: target.lat,
          lng: target.lng,
        })
        if (ph === BattlefieldScenarioPhase.IDLE || ph === BattlefieldScenarioPhase.REGION_SELECTED) {
          setSelectedDetail({
            title: getEnemyDisplayName(target.enemyCategory, target.confidence),
            affiliation: '적',
            lat: target.lat,
            lng: target.lng,
            mgrs: latLngToMgrsSafe(target.lat, target.lng),
            unitCode: trackDigits,
            summary: enemySummary,
            speedKph: target.speedKph,
            headingDeg: target.headingDeg,
            riskLevel: target.riskLevel,
          })
          setScenarioNotice('작전 구역 확정 전이지만, 적 클릭으로 드론은 즉시 출동합니다.')
          openEnemyClickScenarioPopup()
          return
        }
        setSelectedDetail({
          title: getEnemyDisplayName(target.enemyCategory, target.confidence),
          affiliation: '적',
          lat: target.lat,
          lng: target.lng,
          mgrs: latLngToMgrsSafe(target.lat, target.lng),
          unitCode: trackDigits,
          summary: enemySummary,
          speedKph: target.speedKph,
          headingDeg: target.headingDeg,
          riskLevel: target.riskLevel,
        })
        setTacticScores(getTacticScoresForEnemy(target))
        if (ph === BattlefieldScenarioPhase.SAR_SCAN && target.kind === 'MBT') {
          openUavDispatchModal({
            kind: 'enemy',
            title: getEnemyDisplayName(target.enemyCategory, target.confidence),
            summary: '선택 표적 EO/IR 재식별',
            lat: target.lat,
            lng: target.lng,
            enemyId: target.id,
            enemyName: formatScenarioEnemyCompact(target),
          })
        }
        openEnemyClickScenarioPopup()
      }
      for (const lid of scenarioEnemyPickLayers) {
        map.on('mouseenter', lid, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mousemove', lid, handleEnemyScenarioMouseMove)
        map.on('mouseleave', lid, handleEnemyScenarioMouseLeave)
        map.on('click', lid, handleEnemyScenarioClick)
      }

      popupActionClickHandler = (event: MouseEvent) => {
        const rawTarget = event.target
        if (!(rawTarget instanceof HTMLElement)) return
        const button = rawTarget.closest<HTMLButtonElement>('button[data-popup-action]')
        if (!button) return

        event.preventDefault()
        event.stopPropagation()

        const action = button.dataset.popupAction
        const entityId = Number(button.dataset.entityId)
        if (!Number.isFinite(entityId)) return

        const targetMeta = DUMMY_SCENARIO_ENTITIES.find((entity) => entity.id === entityId)
        if (!targetMeta) return
        const pose = enemyBattlefieldPosesRef.current[entityId]
        const target = pose ? { ...targetMeta, lat: pose.lat, lng: pose.lng } : targetMeta
        const unitCode = buildScenarioEntityUnitCode(target)
        const trackDigits = resolveScenarioEnemyTrackDigits({ ...target, unitCode })

        setSelectedDetail({
          title: getEnemyDisplayName(target.enemyCategory, target.confidence),
          affiliation: '적',
          lat: target.lat,
          lng: target.lng,
          mgrs: latLngToMgrsSafe(target.lat, target.lng),
          unitCode: trackDigits,
          summary: `${target.kind} · ${getEnemyStatusLabel(target.detectionStatus)} · ${target.status}`,
          speedKph: target.speedKph,
          headingDeg: target.headingDeg,
          riskLevel: target.riskLevel,
        })

        if (action === 'drone-dispatch') {
          launchDroneFromEnemyClick({
            id: target.id,
            kind: target.kind,
            name: formatScenarioEnemyCompact(target),
            lat: target.lat,
            lng: target.lng,
          })
          openAssetStreamModal('drone')
          return
        }

        if (action === 'tactic-play') {
          button.classList.toggle('service-asset-popup__tactic-btn--selected')
          const tacticName = button.dataset.tacticName?.trim() || '대응 전술'
          const videoUrl = button.dataset.videoUrl?.trim() || tacticVideoUrlForName(tacticName)
          setTacticScores(getTacticScoresForEnemy(target))
          openUavVideoModal({
            title: `대응 전술 영상 · ${tacticName}`,
            subtitle: `${formatScenarioEnemyCompact(target)} 대응 시뮬레이션`,
            videoUrl,
          })
        }
      }
      map.getContainer().addEventListener('click', popupActionClickHandler)

      map.on('click', SERVICE_ALLY_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const idNum = Number((feature.properties ?? {}).id)
        const target = DUMMY_SCENARIO_ENTITIES.find((entity) => entity.id === idNum)
        if (!target) return
        setSelectedDetail({
          title: target.name,
          affiliation: '우군',
          lat: target.lat,
          lng: target.lng,
          mgrs: latLngToMgrsSafe(target.lat, target.lng),
          summary: `${target.kind} · ${target.status}`,
          speedKph: target.speedKph,
          headingDeg: target.headingDeg,
          riskLevel: target.riskLevel,
        })
        setTacticScores(null)
        enemyScenarioPopupPinnedRef.current = false
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
          })
        }
        popupRef.current
          .setLngLat([target.lng, target.lat])
          .setHTML(renderScenarioEntityPopupHtml(target, target.lat, target.lng, 'summary'))
          .addTo(map)
      })

      map.on('click', SERVICE_NEUTRAL_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const idNum = Number((feature.properties ?? {}).id)
        const target = DUMMY_SCENARIO_ENTITIES.find((entity) => entity.id === idNum)
        if (!target) return
        setSelectedDetail({
          title: target.name,
          affiliation: '중립',
          lat: target.lat,
          lng: target.lng,
          mgrs: latLngToMgrsSafe(target.lat, target.lng),
          summary: `${target.kind} · ${target.status}`,
          speedKph: target.speedKph,
          headingDeg: target.headingDeg,
          riskLevel: target.riskLevel,
        })
        setTacticScores(null)
        enemyScenarioPopupPinnedRef.current = false
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
          })
        }
        popupRef.current
          .setLngLat([target.lng, target.lat])
          .setHTML(renderScenarioEntityPopupHtml(target, target.lat, target.lng, 'summary'))
          .addTo(map)
      })

      map.on('mouseenter', SERVICE_SAR2_ZONE_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mousemove', SERVICE_SAR2_ZONE_FILL_LAYER_ID, (event) => {
        const zoneFeature = event.features?.[0]
        const zoneProps = (zoneFeature?.properties ?? {}) as Record<string, unknown>
        const routeFeature = SAR_ENEMY_MOVEMENT_ROUTE_GEOJSON.features[0]
        const routeProps = parseMovementRouteTooltipProps(
          routeFeature?.properties as Record<string, unknown> | undefined,
        )
        const html = renderSarZoneObservationTooltipHtml({
          zoneName: String(zoneProps.name ?? 'SAR-2 광역 관측 지역'),
          zoneNote: zoneProps.note != null ? String(zoneProps.note) : undefined,
          route: routeProps,
        })
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
          })
        }
        popupRef.current
          .setLngLat([event.lngLat.lng, event.lngLat.lat])
          .setHTML(html)
          .addTo(map)
      })
      map.on('mouseleave', SERVICE_SAR2_ZONE_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })
      map.on('mouseenter', SERVICE_ENEMY_ROUTE_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mousemove', SERVICE_ENEMY_ROUTE_HIT_LAYER_ID, (e) => {
        if (!phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.SAR_SCAN)) return
        const feature = e.features?.[0]
        const props = parseMovementRouteTooltipProps(
          feature?.properties as Record<string, unknown> | undefined,
        )
        if (!props) return
        const html = renderSarRouteMovementTooltipHtml(props)
        const g = feature?.geometry as { type?: string; coordinates?: [number, number][] } | undefined
        let lngLat: [number, number] = [127.73, 39.82]
        if (g?.type === 'LineString' && g.coordinates?.length) {
          const mid = Math.floor(g.coordinates.length / 2)
          const c = g.coordinates[mid]!
          lngLat = [c[0], c[1]]
        }
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
          })
        }
        popupRef.current.setLngLat(lngLat).setHTML(html).addTo(map)
      })
      map.on('mouseleave', SERVICE_ENEMY_ROUTE_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })

      map.on('click', SERVICE_SAR2_ZONE_FILL_LAYER_ID, () => {
        setSarZoneProbabilities([...SAR_ZONE_PASS_PROBABILITIES])
        setSarSpotlightSeen(false)
        setSarSpotlightEmphasis(true)
        setSarSpotlightOpen(true)
        setScenarioNotice('SAR-2 관측 지역 분석: 함흥 남하 축선 전차 통과 확률을 산출했습니다.')
        setSelectedDetail({
          title: 'SAR-2 광역 관측 지역',
          affiliation: '적',
          lat: 39.8417,
          lng: 127.535,
          mgrs: latLngToMgrsSafe(39.8417, 127.535),
          summary: `함흥 남하 축선에서 적 전차 통과 확률이 높게 탐지되었습니다. (${BATTLEFIELD_PHASE_PANEL[BattlefieldScenarioPhase.SAR_SCAN].title})`,
          riskLevel: '높음',
        })

        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
        enemyScenarioPopupPinnedRef.current = false
      })

      const layersToBlockPopupDismiss = SERVICE_MAP_OBJECT_CLICK_LAYER_IDS.filter((id) => map.getLayer(id))
      map.on('click', (event) => {
        if (map.getLayer(SERVICE_GRD_MOTION_FILL_LAYER_ID)) {
          const grdHits = map.queryRenderedFeatures(event.point, {
            layers: [SERVICE_GRD_MOTION_FILL_LAYER_ID],
          })
          if (grdHits.length > 0) {
            const motionIdRaw = grdHits[0]?.properties?.motionId
            if (motionIdRaw != null) {
              const motionIdStr = String(motionIdRaw)
              setGrdSelectedIdRef.current(motionIdStr)
              if (phaseAtLeast(scenarioPhaseRef.current, BattlefieldScenarioPhase.SAR_SCAN)) {
                const meta = GRD_MOTION_META[motionIdStr]
                if (meta) {
                  const p = { lat: meta.centerLat, lng: meta.centerLng }
                  const distKm = nearestUavDispatchDistanceKm(uavDispatchAssetsRef.current, p)
                  const hasDispatchableUav = uavDispatchAssetsRef.current.length > 0
                  const html = renderGrdMotionPopupHtml(
                    { classLabel: meta.classLabel, probPercent: meta.probPercent },
                    distKm,
                    hasDispatchableUav,
                    { motionId: motionIdStr },
                  )
                  if (!popupRef.current) {
                    popupRef.current = new maplibregl.Popup({
                      closeButton: false,
                      closeOnClick: false,
                      offset: 14,
                    })
                  }
                  popupRef.current
                    .setLngLat([meta.centerLng, meta.centerLat])
                    .setHTML(html)
                    .addTo(map)
                  setSelectedDetailRef.current({
                    title: `GRD 이동 후보 · ${motionIdStr}`,
                    affiliation: '적',
                    lat: meta.centerLat,
                    lng: meta.centerLng,
                    mgrs: latLngToMgrsSafe(meta.centerLat, meta.centerLng),
                    summary:
                      distKm == null
                        ? `변화검출 클러스터(GRD) · ${meta.classLabel} 의심 · 신뢰도 ${meta.probPercent}% · 가용 UAV 없음`
                        : `변화검출 클러스터(GRD) · ${meta.classLabel} 의심 · 신뢰도 ${meta.probPercent}% · 최근접 UAV 약 ${distKm.toFixed(0)} km${
                            distKm <= GRD_DISPATCH_RANGE_KM
                              ? ' · 근거리'
                              : ' · 원거리(지시 출동 가능)'
                          }`,
                  })
                  setTacticScores(null)
                  if (scenarioPhaseRef.current === BattlefieldScenarioPhase.SAR_SCAN) {
                    setSensorSimModalSensor(null)
                    setUavDispatchRequest({
                      kind: 'grd',
                      title: `GRD 후보 ${motionIdStr}`,
                      summary: `${meta.classLabel} 의심 · 신뢰도 ${meta.probPercent}%`,
                      lat: meta.centerLat,
                      lng: meta.centerLng,
                      motionId: motionIdStr,
                    })
                    setSelectedUavDispatchId(null)
                    setUavDispatchModalOpen(true)
                  }
                }
              }
            }
            return
          }
        }

        const hits = map.queryRenderedFeatures(event.point, { layers: layersToBlockPopupDismiss })
        if (hits.length > 0) {
          setGrdSelectedIdRef.current(null)
          return
        }
        setGrdSelectedIdRef.current(null)
        setSelectedDetailRef.current(null)
        setSelectedAssetIdRef.current(null)
        setTacticScoresRef.current(null)
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
        enemyScenarioPopupPinnedRef.current = false
        if (sarSpotlightOpenRef.current) {
          dismissSarSpotlight()
        }
        const clickLat = event.lngLat.lat
        const clickLng = event.lngLat.lng
        if (
          scenarioPhaseRef.current === BattlefieldScenarioPhase.IDLE &&
          isInsideKoreaOpsRegion(clickLat, clickLng)
        ) {
          selectOperationRegionRef.current()
          return
        }
        setScenarioNotice(null)
      })

      setMapReady(true)
    })

    mapRef.current = map

    return () => {
      enemyScenarioPopupPinnedRef.current = false
      if (popupActionClickHandler) {
        map.getContainer().removeEventListener('click', popupActionClickHandler)
        popupActionClickHandler = null
      }
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
      if (sarLossNoticeStartTimerRef.current != null) {
        window.clearTimeout(sarLossNoticeStartTimerRef.current)
        sarLossNoticeStartTimerRef.current = null
      }
      if (sarLossNoticeTimerRef.current != null) {
        window.clearTimeout(sarLossNoticeTimerRef.current)
        sarLossNoticeTimerRef.current = null
      }
      if (sarLossNoticePopupRef.current) {
        sarLossNoticePopupRef.current.remove()
        sarLossNoticePopupRef.current = null
      }
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [dismissSarSpotlight])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource(SERVICE_ASSETS_SOURCE_ID)
    if (source && 'setData' in source) {
      ;(source as GeoJSONSource).setData(toMapSourceData(assetsForBattlefieldMap))
    }
    const symbolSource = map.getSource(SERVICE_ASSETS_SYMBOL_SOURCE_ID)
    if (symbolSource && 'setData' in symbolSource) {
      ;(symbolSource as GeoJSONSource).setData(toMapSourceData(assetsForBattlefieldMap))
    }
  }, [assetsForBattlefieldMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(SERVICE_MOVERS_SOURCE_ID)
    if (source && 'setData' in source) {
      ;(source as GeoJSONSource).setData(toMapSourceData(movingPointsForMap))
    }
  }, [movingPointsForMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(SERVICE_GROUND_RADAR_VOD_SOURCE_ID)
    if (source && 'setData' in source) {
      ;(source as GeoJSONSource).setData(groundRadarVodAnalytics.geojson as Parameters<GeoJSONSource['setData']>[0])
    }
  }, [groundRadarVodAnalytics])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource(SERVICE_SCENARIO_SOURCE_ID)
    if (!source || !('setData' in source)) return
    ;(source as GeoJSONSource).setData(
      toMapSourceData(
        scenarioEntitiesResolved
          .filter((entity) => scenarioMbtEnemyVisibleOnMap(entity, enemyBattlefieldPoses))
          .map((entity) => scenarioEntityToGeoJsonProperties(entity)),
      ),
    )
  }, [mapReady, scenarioEntitiesResolved, enemyBattlefieldPoses])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyVisibility = (layerId: string, visible: boolean) => {
      if (!map.getLayer(layerId)) return
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }

    applyVisibility(SERVICE_ASSETS_LAYER_ID, layerVisible.friendly)
    applyVisibility(SERVICE_ASSETS_SYMBOL_LAYER_ID, layerVisible.friendly)
    applyVisibility(SERVICE_ASSETS_LABEL_LAYER_ID, layerVisible.friendly)
    applyVisibility(SERVICE_ASSETS_CLUSTER_LAYER_ID, layerVisible.friendly)
    applyVisibility(SERVICE_ASSETS_CLUSTER_COUNT_LAYER_ID, layerVisible.friendly)
    const enemyBaseVisible = layerVisible.enemy
    const enemySymbolOn = enemyBaseVisible && layerVisible.enemySymbol
    applyVisibility(SERVICE_SCENARIO_ENEMY_SYMBOL_LAYER_ID, enemySymbolOn)
    applyVisibility(SERVICE_ENEMY_LAYER_ID, enemyBaseVisible && !layerVisible.enemySymbol)
    applyVisibility(SERVICE_ALLY_LAYER_ID, layerVisible.ally)
    applyVisibility(SERVICE_NEUTRAL_LAYER_ID, layerVisible.neutral)
    applyVisibility(
      SERVICE_SCENARIO_LABEL_LAYER_ID,
      layerVisible.enemy || layerVisible.ally || layerVisible.neutral,
    )
    const mapFlags = BATTLEFIELD_PHASE_MAP_FLAGS[scenarioPhase]
    const showEnemyRoute = false
    const showEnemyRouteAlert = false
    /** 예측 방식 UI 제거: 지도·요약은 3프레임 기반만 사용 */
    const framePredictionActive = true
    const shortestPredictionActive = false
    const framePredictionBaseVisible =
      layerVisible.friendly && layerVisible.enemy && groundRadarVodAnalytics.detectedCount > 0
    const shortestPredictionBaseVisible = framePredictionBaseVisible
    applyVisibility(SERVICE_SAR2_ZONE_FILL_LAYER_ID, mapFlags.sar2Zone)
    applyVisibility(SERVICE_SAR2_ZONE_LINE_LAYER_ID, mapFlags.sar2Zone)
    applyVisibility(SERVICE_ENEMY_ROUTE_LAYER_ID, showEnemyRoute)
    applyVisibility(
      SERVICE_ENEMY_ROUTE_ALERT_LAYER_ID,
      showEnemyRouteAlert,
    )
    applyVisibility(SERVICE_ENEMY_ROUTE_HIT_LAYER_ID, showEnemyRoute)
    applyVisibility(
      SERVICE_GROUND_RADAR_COVERAGE_FILL_LAYER_ID,
      layerVisible.friendly && fmcwCoverageOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_COVERAGE_LINE_LAYER_ID,
      layerVisible.friendly && fmcwCoverageOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_COVERAGE_SCAN_LAYER_ID,
      layerVisible.friendly && fmcwCoverageOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_RISK_FILL_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRiskOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_RISK_LINE_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRiskOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_RISK_LABEL_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRiskOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PAST_TRACK_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PAST_POINT_LAYER_ID,
      false,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_CORRIDOR_FILL_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_CORRIDOR_LINE_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_ALT_AXIS_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PREDICT_GLOW_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PREDICT_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PREDICT_ENDPOINT_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_DBSCAN_LAYER_ID,
      framePredictionBaseVisible && framePredictionActive,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_RISK_SHORTEST_FILL_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRiskOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_RISK_SHORTEST_LINE_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRiskOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_RISK_SHORTEST_LABEL_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRiskOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PAST_TRACK_5_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PAST_POINT_5_LAYER_ID,
      false,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_CORRIDOR_5_FILL_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_CORRIDOR_5_LINE_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_ALT_AXIS_5_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PREDICT_SHORTEST_GLOW_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PREDICT_SHORTEST_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    applyVisibility(
      SERVICE_GROUND_RADAR_PREDICT_SHORTEST_ENDPOINT_LAYER_ID,
      shortestPredictionBaseVisible && shortestPredictionActive && fmcwPredictionRouteOn,
    )
    // 정적 FMCW 더미 경로/위험 레이어는 사용하지 않음(탐지 적 기반 예측으로 대체)
    applyVisibility(SERVICE_FMCW_RISK_FILL_LAYER_ID, false)
    applyVisibility(SERVICE_FMCW_RISK_LINE_LAYER_ID, false)
    applyVisibility(SERVICE_FMCW_INGRESS_LINE_LAYER_ID, false)
    applyVisibility(
      SERVICE_FMCW_TRACK_LAYER_ID,
      false,
    )

    const pen = mapFlags.showSarGrdPeninsulaOverlay
    /** SAR 전개 직후에도 1단계(prep)에서 GRD가 가려지지 않도록, 반도 GRD 오버레이가 켜진 단계에서는 항상 표시 */
    const showMotion = pen

    applyVisibility(SERVICE_GRD_MOTION_FILL_LAYER_ID, showMotion && grdMotionMapOverlayOn)
    applyVisibility(SERVICE_GRD_MOTION_LINE_LAYER_ID, showMotion && grdMotionMapOverlayOn)
  }, [
    layerVisible,
    scenarioPhase,
    grdMotionMapOverlayOn,
    fmcwCoverageOn,
    fmcwPredictionRouteOn,
    fmcwPredictionRiskOn,
    groundRadarVodAnalytics.detectedCount,
  ])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const setLayerFilter = (layerId: string, filter: unknown[]) => {
      if (!map.getLayer(layerId)) return
      map.setFilter(layerId, filter as Parameters<typeof map.setFilter>[1])
    }

    // 핫리로드/기존 세션에서도 최신 예측 분류(kinds)를 강제로 반영
    setLayerFilter(SERVICE_GROUND_RADAR_RISK_FILL_LAYER_ID, ['==', ['get', 'kind'], 'risk_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_RISK_LINE_LAYER_ID, ['==', ['get', 'kind'], 'risk_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_RISK_LABEL_LAYER_ID, ['==', ['get', 'kind'], 'risk_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_RISK_SHORTEST_FILL_LAYER_ID, ['==', ['get', 'kind'], 'risk_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_RISK_SHORTEST_LINE_LAYER_ID, ['==', ['get', 'kind'], 'risk_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_RISK_SHORTEST_LABEL_LAYER_ID, ['==', ['get', 'kind'], 'risk_5'])

    setLayerFilter(SERVICE_GROUND_RADAR_PAST_TRACK_LAYER_ID, ['==', ['get', 'kind'], 'predict_past_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_PAST_POINT_LAYER_ID, ['==', ['get', 'kind'], 'past_point_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_PAST_TRACK_5_LAYER_ID, ['==', ['get', 'kind'], 'predict_past_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_PAST_POINT_5_LAYER_ID, ['==', ['get', 'kind'], 'past_point_5'])

    setLayerFilter(SERVICE_GROUND_RADAR_CORRIDOR_FILL_LAYER_ID, ['==', ['get', 'kind'], 'corridor_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_CORRIDOR_LINE_LAYER_ID, ['==', ['get', 'kind'], 'corridor_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_CORRIDOR_5_FILL_LAYER_ID, ['==', ['get', 'kind'], 'corridor_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_CORRIDOR_5_LINE_LAYER_ID, ['==', ['get', 'kind'], 'corridor_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_ALT_AXIS_LAYER_ID, ['==', ['get', 'kind'], 'axis_alt_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_ALT_AXIS_5_LAYER_ID, ['==', ['get', 'kind'], 'axis_alt_5'])

    setLayerFilter(SERVICE_GROUND_RADAR_PREDICT_GLOW_LAYER_ID, ['==', ['get', 'kind'], 'axis_main_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_PREDICT_LAYER_ID, ['==', ['get', 'kind'], 'axis_main_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_PREDICT_ENDPOINT_LAYER_ID, ['==', ['get', 'kind'], 'future_point_3'])
    setLayerFilter(SERVICE_GROUND_RADAR_PREDICT_SHORTEST_GLOW_LAYER_ID, ['==', ['get', 'kind'], 'axis_main_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_PREDICT_SHORTEST_LAYER_ID, ['==', ['get', 'kind'], 'axis_main_5'])
    setLayerFilter(SERVICE_GROUND_RADAR_PREDICT_SHORTEST_ENDPOINT_LAYER_ID, [
      '==',
      ['get', 'kind'],
      'future_point_5',
    ])
  }, [mapReady])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return

    const visibleLayerId = GOOGLE_BASE_PRESETS[baseMapPreset].layerId
    for (const layerId of GOOGLE_BASE_LAYER_IDS) {
      if (!map.getLayer(layerId)) continue
      map.setLayoutProperty(layerId, 'visibility', layerId === visibleLayerId ? 'visible' : 'none')
    }
  }, [baseMapPreset, mapReady])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return

    const brightness = Math.max(-60, Math.min(60, rasterTuning.brightness))
    const brightnessMin = brightness >= 0 ? brightness / 100 : 0
    const brightnessMax = brightness >= 0 ? 1 : 1 + brightness / 100
    const contrast = Math.max(-1, Math.min(1, rasterTuning.contrast / 100))
    const saturation = Math.max(-1, Math.min(1, rasterTuning.saturation / 100))
    const hue = Math.max(-180, Math.min(180, rasterTuning.hue))
    const opacity = Math.max(0.2, Math.min(1, rasterTuning.opacity / 100))

    for (const layerId of GOOGLE_BASE_LAYER_IDS) {
      if (!map.getLayer(layerId)) continue
      map.setPaintProperty(layerId, 'raster-brightness-min', brightnessMin)
      map.setPaintProperty(layerId, 'raster-brightness-max', brightnessMax)
      map.setPaintProperty(layerId, 'raster-contrast', contrast)
      map.setPaintProperty(layerId, 'raster-saturation', saturation)
      map.setPaintProperty(layerId, 'raster-hue-rotate', hue)
      map.setPaintProperty(layerId, 'raster-opacity', opacity)
    }
  }, [mapReady, rasterTuning])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map || !map.getLayer(SERVICE_GRD_MOTION_FILL_LAYER_ID)) return

    const src = SERVICE_GRD_MOTION_SOURCE_ID
    let prevHoverId: string | null = null

    const clearHoverVisual = (id: string | null) => {
      if (!id) return
      try {
        map.setFeatureState({ source: src, id }, { hover: false })
      } catch {
        /* MapLibre: id 미일치 시 무시 */
      }
    }

    const clearGrdHoverUi = () => {
      if (prevHoverId) clearHoverVisual(prevHoverId)
      prevHoverId = null
      setGrdHoverId(null)
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
    }

    const onMove = (e: MapLayerMouseEvent) => {
      const top = map.queryRenderedFeatures(e.point)[0]
      const lid = top?.layer?.id
      if (lid !== SERVICE_GRD_MOTION_FILL_LAYER_ID) {
        clearGrdHoverUi()
        return
      }

      const motionIdRaw = top.properties?.motionId
      const motionId = motionIdRaw != null ? String(motionIdRaw) : null
      if (!motionId) {
        clearGrdHoverUi()
        return
      }

      if (motionId !== prevHoverId) {
        if (prevHoverId) clearHoverVisual(prevHoverId)
        prevHoverId = motionId
        try {
          map.setFeatureState({ source: src, id: motionId }, { hover: true })
        } catch {
          /* noop */
        }
      }

      setGrdHoverId(motionId)

      const meta = GRD_MOTION_META[motionId]
      if (!meta) return

      const p = { lat: meta.centerLat, lng: meta.centerLng }
      const distKm = nearestUavDispatchDistanceKm(uavDispatchAssetsRef.current, p)
      const hasDispatchableUav = uavDispatchAssetsRef.current.length > 0

      const html = renderGrdMotionPopupHtml(
        { classLabel: meta.classLabel, probPercent: meta.probPercent },
        distKm,
        hasDispatchableUav,
        { motionId },
      )
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
        })
      }
      popupRef.current.setLngLat([meta.centerLng, meta.centerLat]).setHTML(html).addTo(map)
    }

    const onLeave = () => {
      map.getCanvas().style.cursor = ''
      clearGrdHoverUi()
    }

    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }

    map.on('mouseenter', SERVICE_GRD_MOTION_FILL_LAYER_ID, onEnter)
    map.on('mousemove', SERVICE_GRD_MOTION_FILL_LAYER_ID, onMove)
    map.on('mouseleave', SERVICE_GRD_MOTION_FILL_LAYER_ID, onLeave)

    return () => {
      clearGrdHoverUi()
      map.off('mouseenter', SERVICE_GRD_MOTION_FILL_LAYER_ID, onEnter)
      map.off('mousemove', SERVICE_GRD_MOTION_FILL_LAYER_ID, onMove)
      map.off('mouseleave', SERVICE_GRD_MOTION_FILL_LAYER_ID, onLeave)
    }
  }, [mapReady])

  /** 모달에서 「시뮬레이션 진행」 확정 시에만 호출 — IDLE·잘못된 단계에서는 무동작 */
  const applySensorSimulationStep = useCallback(
    (sensorId: ServiceSensorId) => {
      const phaseIdle = scenarioPhaseRef.current === BattlefieldScenarioPhase.IDLE
      if (phaseIdle) return
      if (
        scenarioPhaseRef.current === BattlefieldScenarioPhase.REGION_SELECTED &&
        sensorId !== 'sar'
      ) {
        return
      }

      const s = sensorId as BattlefieldSensorId
      if (
        scenarioPhaseRef.current === BattlefieldScenarioPhase.REGION_SELECTED &&
        sensorId === 'sar'
      ) {
        enterSarScanPhase(undefined)
        return
      }

      const phaseNow = scenarioPhaseRef.current
      const gate = grdDispatchGateRef.current
      if (sensorId === 'uav' && phaseNow === BattlefieldScenarioPhase.SAR_SCAN) {
        const enemyBypass = sarEnemyUavBypassPayloadRef.current
        const dispatchTarget = pendingUavDispatchTargetRef.current
        if (!enemyBypass && !dispatchTarget && (!gate.focusId || !gate.eligible)) {
          setScenarioNotice(
            '파란 GRD 검출 영역 또는 적 표적을 먼저 선택하고, DB 자산 현황에 UAV가 1개 이상 있어야 출동할 수 있습니다.',
          )
          return
        }
      }
      if (sensorId === 'drone' && phaseNow === BattlefieldScenarioPhase.UAV_DISPATCHED) {
        if (!droneStrikeTargetRef.current) {
          setScenarioNotice('지도에서 적 표적을 먼저 선택한 뒤 드론 근접을 누르세요.')
          return
        }
      }

      let advancedTo: BattlefieldScenarioPhase | null = null
      setScenarioPhase((prev) => {
        const next = tryAdvancePhaseWithSensor(prev, s)
        if (next) advancedTo = next
        return next ?? prev
      })

      if (advancedTo === BattlefieldScenarioPhase.UAV_DISPATCHED) {
        const enemyBypass = sarEnemyUavBypassPayloadRef.current
        const dispatchTarget = pendingUavDispatchTargetRef.current
        const dispatchedUav = pendingUavDispatchRef.current
        sarEnemyUavBypassPayloadRef.current = null
        pendingUavDispatchTargetRef.current = null
        pendingUavDispatchRef.current = null
        if (dispatchTarget) {
          uavGrdMissionRef.current = {
            centerLat: dispatchTarget.lat,
            centerLng: dispatchTarget.lng,
          }
          uavChasingEnemyIdRef.current =
            dispatchTarget.kind === 'enemy' ? dispatchTarget.enemyId ?? null : null
          setActiveUavDispatchTarget(dispatchTarget)
        } else if (enemyBypass) {
          uavGrdMissionRef.current = {
            centerLat: enemyBypass.centerLat,
            centerLng: enemyBypass.centerLng,
          }
          uavChasingEnemyIdRef.current = enemyBypass.enemyId
          setActiveUavDispatchTarget({
            kind: 'enemy',
            title: '선택 표적',
            summary: '선택 표적 EO/IR 재식별',
            lat: enemyBypass.centerLat,
            lng: enemyBypass.centerLng,
            enemyId: enemyBypass.enemyId,
          })
        } else {
          const g = grdDispatchGateRef.current
          const fid = g.focusId
          if (fid && GRD_MOTION_META[fid]) {
            const m = GRD_MOTION_META[fid]
            uavGrdMissionRef.current = { centerLat: m.centerLat, centerLng: m.centerLng }
            setActiveUavDispatchTarget({
              kind: 'grd',
              title: `GRD 후보 ${fid}`,
              summary: `${m.classLabel} 의심 · 신뢰도 ${m.probPercent}%`,
              lat: m.centerLat,
              lng: m.centerLng,
              motionId: fid,
            })
          } else {
            uavGrdMissionRef.current = { centerLat: 39.58, centerLng: 127.22 }
            setActiveUavDispatchTarget({
              kind: 'grd',
              title: 'GRD 후보',
              summary: '기본 GRD 목표',
              lat: 39.58,
              lng: 127.22,
            })
          }
          uavChasingEnemyIdRef.current = null
        }
        const up = sensorPaths.uav
        const start =
          dispatchedUav != null
            ? { lat: dispatchedUav.lat, lng: dispatchedUav.lng }
            : up.length > 0
            ? { lat: up[0]!.lat, lng: up[0]!.lng }
            : { lat: GRD_FALLBACK_SAR_UAV_ORIGIN.lat, lng: GRD_FALLBACK_SAR_UAV_ORIGIN.lng }
        uavReturnToBaseRef.current = null
        setUavSimPos(start)
        setActiveDispatchedUav(dispatchedUav)
        setScenarioNotice(
          dispatchedUav == null
            ? BATTLEFIELD_SCENARIO_NOTICES.uavDispatched
            : `${dispatchedUav.name} 출동 · 목표 ${dispatchedUav.distanceKm.toFixed(1)}km · ETA ${formatEtaMinutes(
                dispatchedUav.etaMin,
              )} · ${dispatchedUav.reasons.slice(1, 3).join(' · ')}`,
        )
      } else if (sensorId === 'uav' && phaseNow === BattlefieldScenarioPhase.UAV_DISPATCHED) {
        const dispatchTarget = pendingUavDispatchTargetRef.current
        const dispatchedUav = pendingUavDispatchRef.current
        pendingUavDispatchTargetRef.current = null
        pendingUavDispatchRef.current = null
        if (dispatchTarget) {
          uavGrdMissionRef.current = {
            centerLat: dispatchTarget.lat,
            centerLng: dispatchTarget.lng,
          }
          uavChasingEnemyIdRef.current =
            dispatchTarget.kind === 'enemy' ? dispatchTarget.enemyId ?? null : null
          setActiveUavDispatchTarget(dispatchTarget)
        }
        if (dispatchedUav) {
          setUavSimPos({ lat: dispatchedUav.lat, lng: dispatchedUav.lng })
          setActiveDispatchedUav(dispatchedUav)
          setScenarioNotice(
            `${dispatchedUav.name} 재출동 · 목표 ${dispatchedUav.distanceKm.toFixed(1)}km · ETA ${formatEtaMinutes(
              dispatchedUav.etaMin,
            )} · ${dispatchedUav.reasons.slice(1, 3).join(' · ')}`,
          )
        }
      } else if (sensorId === 'uav' && phaseNow === BattlefieldScenarioPhase.SAR_SCAN) {
        sarEnemyUavBypassPayloadRef.current = null
        pendingUavDispatchTargetRef.current = null
        pendingUavDispatchRef.current = null
      }
      if (advancedTo === BattlefieldScenarioPhase.DRONE_RECON) {
        const strikeId = droneStrikeEntityIdRef.current
        const strikeTarget = droneStrikeTargetRef.current
        const strikeEntity =
          strikeId == null
            ? null
            : scenarioEntitiesResolvedRef.current.find((entity) => entity.id === strikeId) ?? null
        const mission =
          strikeEntity != null
            ? { lat: strikeEntity.lat, lng: strikeEntity.lng }
            : strikeTarget != null
              ? { lat: strikeTarget.lat, lng: strikeTarget.lng }
              : null
        if (mission) {
          droneMissionRef.current = { centerLat: mission.lat, centerLng: mission.lng }
          droneChasingEnemyIdRef.current = strikeEntity != null ? strikeEntity.id : null
        } else {
          droneMissionRef.current = null
          droneChasingEnemyIdRef.current = null
        }
        const dp = sensorPaths.drone
        const defaultDroneAsset = assetsRef.current.find((asset) => asset.category === 'DRONE') ?? null
        if (defaultDroneAsset) {
          setActiveDispatchedDroneId(defaultDroneAsset.id)
        }
        const start =
          droneSimPosRef.current != null
            ? droneSimPosRef.current
            : dp.length > 0
              ? { lat: dp[0]!.lat, lng: dp[0]!.lng }
              : { lat: GRD_FALLBACK_SAR_UAV_ORIGIN.lat, lng: GRD_FALLBACK_SAR_UAV_ORIGIN.lng }
        droneReturnToBaseRef.current = null
        setDroneSimPos(start)
        setScenarioNotice(BATTLEFIELD_SCENARIO_NOTICES.droneRecon)
      }
      if (advancedTo === BattlefieldScenarioPhase.FMCW_ANALYSIS) {
        setScenarioNotice(BATTLEFIELD_SCENARIO_NOTICES.fmcwAnalysis)
      }

      setSensorState((prev) => {
        const pathLength = sensorPaths[sensorId].length
        const nextIndex =
          sensorId === 'drone' && advancedTo === BattlefieldScenarioPhase.DRONE_RECON
            ? 0
            : pathLength <= 1
              ? 0
              : (prev[sensorId].index + 1) % pathLength
        return {
          ...prev,
          [sensorId]: { running: true, index: nextIndex },
        }
      })
    },
    [enterSarScanPhase, sensorPaths],
  )

  const handleConfirmUavDispatch = useCallback(() => {
    if (!uavDispatchRequest) return
    const picked =
      uavDispatchCandidates.find((candidate) => candidate.id === selectedUavDispatchId) ??
      uavDispatchCandidates[0] ??
      null
    if (!picked) {
      setScenarioNotice(`출동 가능한 ${uavDispatchRequest.kind === 'enemy' ? '드론' : 'UAV'} 후보를 찾지 못했습니다.`)
      return
    }
    if (!picked.inRange) {
      setScenarioNotice(
        `선택한 ${uavDispatchRequest.kind === 'enemy' ? '드론' : 'UAV'}이(가) ${GRD_DISPATCH_RANGE_KM}km 밖이지만, 지시 우선으로 출동시킵니다.`,
      )
    }
    if (uavDispatchRequest.kind === 'enemy') {
      const enemyName = uavDispatchRequest.enemyName ?? uavDispatchRequest.title
      setDroneStrikeTarget({ lat: uavDispatchRequest.lat, lng: uavDispatchRequest.lng, name: enemyName })
      setDroneStrikeEntityId(uavDispatchRequest.enemyId ?? null)
      droneMissionRef.current = {
        centerLat: uavDispatchRequest.lat,
        centerLng: uavDispatchRequest.lng,
      }
      droneChasingEnemyIdRef.current = uavDispatchRequest.enemyId ?? null
      droneReturnToBaseRef.current = null
      setActiveDispatchedDroneId(picked.id)
      setDroneSimPos({ lat: picked.lat, lng: picked.lng })
      setSensorState((prev) => ({
        ...prev,
        drone: { ...prev.drone, running: true },
      }))
      closeUavDispatchModal()
      setScenarioNotice(
        `${picked.name} 드론 출동 · 목표 ${picked.distanceKm.toFixed(1)}km · ETA ${formatEtaMinutes(
          picked.etaMin,
        )} · ${picked.reasons.slice(1, 3).join(' · ')}`,
      )
      return
    }
    uavGrdMissionRef.current = {
      centerLat: uavDispatchRequest.lat,
      centerLng: uavDispatchRequest.lng,
    }
    uavChasingEnemyIdRef.current = null
    uavReturnToBaseRef.current = null
    setActiveUavDispatchTarget(uavDispatchRequest)
    setActiveDispatchedUav(picked)
    setUavSimPos({ lat: picked.lat, lng: picked.lng })
    setSensorState((prev) => ({
      ...prev,
      uav: { ...prev.uav, running: true },
    }))
    pendingUavDispatchTargetRef.current = uavDispatchRequest
    pendingUavDispatchRef.current = picked
    closeUavDispatchModal()
    setScenarioNotice(
      `${picked.name} 출동 · 목표 ${picked.distanceKm.toFixed(1)}km · ETA ${formatEtaMinutes(
        picked.etaMin,
      )} · ${picked.reasons.slice(1, 3).join(' · ')}`,
    )
  }, [
    closeUavDispatchModal,
    selectedUavDispatchId,
    uavDispatchCandidates,
    uavDispatchRequest,
  ])

  const handleToggleEnemyTactic = useCallback((tacticName: string) => {
    setSelectedEnemyTacticNames((prev) =>
      prev.includes(tacticName) ? prev.filter((name) => name !== tacticName) : [...prev, tacticName],
    )
  }, [])

  const handleApplyEnemyTactics = useCallback(() => {
    if (uavDispatchRequest?.kind !== 'enemy') return
    const selectedRows = enemyDispatchTacticRows.filter((row) =>
      selectedEnemyTacticNames.includes(row.name),
    )
    const appliedRows = selectedRows.length > 0 ? selectedRows : enemyDispatchTacticRows.slice(0, 1)
    if (appliedRows.length === 0) {
      setScenarioNotice('적 표적에 적용할 전술 후보가 아직 없습니다.')
      return
    }
    setTacticScores(appliedRows)
    const enemyName = uavDispatchRequest.enemyName ?? uavDispatchRequest.title
    const primary = appliedRows[0]!
    openUavVideoModal({
      title: `대응 전술 영상 · ${primary.name}`,
      subtitle: `${enemyName} 대응 시뮬레이션`,
      videoUrl: tacticVideoUrlForName(primary.name),
    })
    setScenarioNotice(`대응 전술 적용: ${appliedRows.map((row) => row.name).join(' · ')}`)
    closeUavDispatchModal()
  }, [
    closeUavDispatchModal,
    enemyDispatchTacticRows,
    openUavVideoModal,
    selectedEnemyTacticNames,
    uavDispatchRequest,
  ])

  const handleOpenGrdEnemyMotionVideo = useCallback(() => {
    if (!grdEnemyMotionAlert) return
    openUavVideoModal({
      title: 'SAR 이동 알림',
      subtitle: `${grdEnemyMotionAlert.enemyName} 포착 영상`,
      videoUrl: ENEMY_TANK_ASSEMBLY_VIDEO_URL,
    })
  }, [grdEnemyMotionAlert, openUavVideoModal])

  const grdEnemyAlertCompactName = useMemo(() => {
    if (!grdEnemyMotionAlert) return ''
    const compact = grdEnemyMotionAlert.enemyName
      .replace(/^적\s*/u, '')
      .replace(/\s*\([^)]*\)\s*/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
    return compact.length > 18 ? `${compact.slice(0, 18)}...` : compact
  }, [grdEnemyMotionAlert])

  const sensorSimProceed = useMemo(() => {
    if (sensorSimModalSensor == null) {
      return { canProceed: false as boolean, hint: undefined as string | undefined }
    }
    return getSensorSimulationProceedState(sensorSimModalSensor, scenarioPhase, {
      grdFocusId,
      grdEligible: grdDispatchEligible,
      sarEnemyUavEligible: sarEnemyUavDispatchEligible,
      droneStrikeTarget,
    })
  }, [
    sensorSimModalSensor,
    scenarioPhase,
    grdFocusId,
    grdDispatchEligible,
    sarEnemyUavDispatchEligible,
    droneStrikeTarget,
  ])

  const handleSensorSimulationModalProceed = useCallback(() => {
    if (sensorSimModalSensor == null) return
    const gate = getSensorSimulationProceedState(sensorSimModalSensor, scenarioPhase, {
      grdFocusId,
      grdEligible: grdDispatchEligible,
      sarEnemyUavEligible: sarEnemyUavDispatchEligible,
      droneStrikeTarget,
    })
    if (!gate.canProceed) return
    if (sensorSimModalSensor === 'uav' && scenarioPhase === BattlefieldScenarioPhase.SAR_SCAN) {
      if (grdFocusId && grdDispatchEligible && GRD_MOTION_META[grdFocusId]) {
        const meta = GRD_MOTION_META[grdFocusId]
        openUavDispatchModal({
          kind: 'grd',
          title: `GRD 후보 ${grdFocusId}`,
          summary: `${meta.classLabel} 의심 · 신뢰도 ${meta.probPercent}%`,
          lat: meta.centerLat,
          lng: meta.centerLng,
          motionId: grdFocusId,
        })
        setSensorSimModalSensor(null)
        return
      }
      if (sarEnemyUavDispatchEligible && droneStrikeEntityId != null && droneStrikeTarget) {
        openUavDispatchModal({
          kind: 'enemy',
          title: droneStrikeTarget.name,
          summary: '선택 표적 EO/IR 재식별',
          lat: droneStrikeTarget.lat,
          lng: droneStrikeTarget.lng,
          enemyId: droneStrikeEntityId,
          enemyName: droneStrikeTarget.name,
        })
        setSensorSimModalSensor(null)
        return
      }
    }
    applySensorSimulationStep(sensorSimModalSensor)
    setSensorSimModalSensor(null)
  }, [
    sensorSimModalSensor,
    scenarioPhase,
    grdFocusId,
    grdDispatchEligible,
    sarEnemyUavDispatchEligible,
    droneStrikeEntityId,
    droneStrikeTarget,
    applySensorSimulationStep,
    openUavDispatchModal,
  ])

  const focusAssetOnMap = useCallback((asset: ServiceAssetPoint) => {
    const map = mapRef.current
    if (!map) return
    const isActiveUav =
      asset.category === 'UAV' &&
      activeDispatchedUav?.id === asset.id &&
      sensorState.uav.running &&
      uavSimPos != null
    const missionLine =
      isActiveUav && activeUavDispatchTargetText != null
        ? `사용중 · ${activeUavDispatchTargetText}`
        : asset.mission

    map.flyTo({
      center: [asset.lng, asset.lat],
      zoom: 11.2,
      pitch: 0,
      bearing: 0,
      speed: 0.8,
      essential: true,
    })

    const html = renderServiceAssetPopupHtml({
      name: asset.name,
      category: asset.category,
      lat: asset.lat,
      lng: asset.lng,
      unitCode: asset.unitCode,
      level: asset.level,
      formation: asset.formation,
      elevationM: asset.elevationM,
      mgrs: asset.mgrs,
      readiness: asset.readiness,
      mission: missionLine,
    })
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
      })
    }
    popupRef.current.setLngLat([asset.lng, asset.lat]).setHTML(html).addTo(map)
  }, [
    activeDispatchedUav,
    activeUavDispatchTargetText,
    sensorState.uav.running,
    uavSimPos,
  ])

  const handleCategoryClick = useCallback(
    (category: ServiceAssetCategory) => {
      setSelectedAssetId(null)
      setActiveCategory((prev) => (prev === category ? null : category))
      const list = grouped[category]
      if (list.length === 0) return
      const map = mapRef.current
      if (!map) return
      const bounds = new maplibregl.LngLatBounds(
        [list[0]!.lng, list[0]!.lat],
        [list[0]!.lng, list[0]!.lat],
      )
      for (const asset of list) {
        bounds.extend([asset.lng, asset.lat])
      }
      map.fitBounds(bounds, { padding: 80, duration: 550, maxZoom: 10.8 })
    },
    [grouped],
  )

  const handleReturnAssetToBase = useCallback(
    (asset: ServiceAssetPoint) => {
      if (asset.category === 'UAV') {
        if (!uavSimPos || activeDispatchedUav?.id !== asset.id) {
          setScenarioNotice(`${asset.name}은(는) 현재 출동 중인 UAV가 아닙니다.`)
          return
        }
        const home = uavHomeByIdRef.current[asset.id]
        if (!home) {
          setScenarioNotice('UAV 초기 위치 정보를 찾지 못했습니다.')
          return
        }
        uavReturnToBaseRef.current = { lat: home.lat, lng: home.lng }
        uavChasingEnemyIdRef.current = null
        uavGrdMissionRef.current = null
        setActiveUavDispatchTarget(null)
        setSensorState((prev) => ({ ...prev, uav: { ...prev.uav, running: true } }))
        setScenarioNotice(`${asset.name} 회항 지시: 최초 배치 위치로 복귀합니다.`)
        return
      }

      if (asset.category === 'DRONE') {
        if (!droneSimPos || activeDispatchedDroneId !== asset.id) {
          setScenarioNotice(`${asset.name}은(는) 현재 출동 중인 드론이 아닙니다.`)
          return
        }
        const home = droneHomeByIdRef.current[asset.id]
        if (!home) {
          setScenarioNotice('드론 초기 위치 정보를 찾지 못했습니다.')
          return
        }
        droneReturnToBaseRef.current = { lat: home.lat, lng: home.lng }
        droneMissionRef.current = null
        droneChasingEnemyIdRef.current = null
        setDroneStrikeEntityId(null)
        setDroneStrikeTarget(null)
        setSensorState((prev) => ({ ...prev, drone: { ...prev.drone, running: true } }))
        setScenarioNotice(`${asset.name} 회항 지시: 최초 배치 위치로 복귀합니다.`)
      }
    },
    [activeDispatchedDroneId, activeDispatchedUav, droneSimPos, uavSimPos],
  )

  const handleAssetClick = useCallback(
    (asset: ServiceAssetPoint) => {
      if (
        scenarioPhase === BattlefieldScenarioPhase.REGION_SELECTED &&
        asset.category === 'SAR'
      ) {
        setScenarioNotice(
          'SAR 시뮬레이션은 좌측 「SAR」 버튼에서 설명을 확인한 뒤 진행하세요.',
        )
      }
      setActiveCategory(asset.category)
      setSelectedAssetId(asset.id)
      setTacticScores(null)
      const isActiveUav =
        asset.category === 'UAV' &&
        activeDispatchedUav?.id === asset.id &&
        sensorState.uav.running &&
        uavSimPos != null
      setSelectedDetail({
        title: asset.name,
        affiliation: '아군',
        lat: asset.lat,
        lng: asset.lng,
        mgrs: asset.mgrs,
        unitCode: effectiveUnitIdentificationCode(asset.category, asset.id, asset.unitCode),
        summary:
          isActiveUav && activeUavDispatchTargetText != null
            ? `사용중 · ${activeUavDispatchTargetText}`
            : asset.mission,
        elevationM: asset.elevationM,
      })
      if (asset.category === 'DRONE') {
        setActiveDispatchedDroneId(asset.id)
        const fallbackVideo = DRONE_ASSET_STREAM_FALLBACK_VIDEO_URLS[0] ?? BATTLEFIELD_UAV_CLICK_VIDEO_URL
        const resolvedVideoUrl =
          asset.situationVideoUrl && asset.situationVideoUrl.trim().length > 0
            ? asset.situationVideoUrl
            : fallbackVideo
        setDroneInlineVideoPanel({
          assetId: asset.id,
          title: `${asset.name} 시야 영상`,
          videoUrl: resolvedVideoUrl,
        })
      }
      focusAssetOnMap(asset)
    },
    [
      focusAssetOnMap,
      scenarioPhase,
      sensorState.uav.running,
      activeDispatchedUav,
      activeUavDispatchTargetText,
      uavSimPos,
    ],
  )

  const toggleLayer = (key: LayerToggleKey) => {
    setLayerVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const allMapLayersOn = useMemo(
    () => (Object.keys(LAYER_TOGGLE_LABEL) as LayerToggleKey[]).every((k) => layerVisible[k]),
    [layerVisible],
  )

  const toggleAllMapLayers = useCallback(() => {
    setLayerVisible((prev) => {
      const keys = Object.keys(LAYER_TOGGLE_LABEL) as LayerToggleKey[]
      const on = keys.every((k) => prev[k])
      if (on) {
        return keys.reduce(
          (acc, k) => ({ ...acc, [k]: false }),
          {} as Record<LayerToggleKey, boolean>,
        )
      }
      return { ...DEFAULT_LAYER_VISIBLE }
    })
  }, [])

  const handleRasterTuningChange = useCallback((key: keyof MapRasterTuning, value: number) => {
    setRasterTuning((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleRasterTuningReset = useCallback(() => {
    setRasterTuning(DEFAULT_MAP_RASTER_TUNING)
  }, [])

  const handleResetScenario = useCallback(() => {
    clearSarLossMapNotice()
    setScenarioSummaryOpen(false)
    setUavSimPos(null)
    setDroneSimPos(null)
    uavChasingEnemyIdRef.current = null
    uavGrdMissionRef.current = null
    droneChasingEnemyIdRef.current = null
    droneMissionRef.current = null
    sarEnemyUavBypassPayloadRef.current = null
    pendingUavDispatchTargetRef.current = null
    pendingUavDispatchRef.current = null
    enemyMarchRoutesRef.current = {}
    enemyMarchCumRef.current = {}
    enemyMarchAlongMRef.current = {}
    enemyTrackHistoryRef.current = {}
    uavReturnToBaseRef.current = null
    droneReturnToBaseRef.current = null
    setDroneStrikeEntityId(null)
    setActiveDispatchedUav(null)
    setActiveDispatchedDroneId(null)
    setActiveUavDispatchTarget(null)
    setUavVideoModal(null)
    setAssetStreamModal(null)
    setDroneInlineVideoPanel(null)
    setScenarioPhase(BattlefieldScenarioPhase.IDLE)
    setSensorState(INITIAL_SENSOR_STATE)
    setBattlefieldSpeedIdx(0)
    setSimulationPaused(false)
    timelineSnapshotsRef.current = []
    timelineCursorRef.current = 0
    setTimelineCursor(0)
    setTimelineLength(0)
    setSarSpotlightSeen(false)
    setSarZoneProbabilities(null)
    setSarSpotlightOpen(false)
    setSarSpotlightEmphasis(false)
    setScenarioNotice(null)
    setSelectedDetail(null)
    setTacticScores(null)
    setSelectedAssetId(null)
    setLayerVisible({ ...DEFAULT_LAYER_VISIBLE })
    setEnemyBattlefieldPoses({})
    setSensorSimModalSensor(null)
    setFmcwSummaryModalOpen(false)
    setFmcwCoverageOn(true)
    setFmcwPredictionRouteOn(true)
    setFmcwPredictionRiskOn(true)
    setFmcwSummarySection('point')
    setFmcwBevRadarId(GROUND_RADAR_SITES[0]?.id ?? 97001)
    closeUavDispatchModal()
    setGrdEnemyMotionAlert(null)
    setGrdSelectedId(null)
    setGrdHoverId(null)
    enemyPrevInsideGrdRef.current = {}
    grdOverlayActivePrevRef.current = false
    setSarGrdVizModalOpen(false)
    setGrdMotionMapOverlayOn(false)
  }, [clearSarLossMapNotice, closeUavDispatchModal])

  const handlePrimaryScenarioAction = useCallback(() => {
    if (scenarioPhase === BattlefieldScenarioPhase.IDLE) {
      selectOperationRegion()
      return
    }
    if (scenarioPhase === BattlefieldScenarioPhase.REGION_SELECTED) {
      // "SAR 전개" CTA는 모달 없이 즉시 SAR 단계로 진입
      applySensorSimulationStep('sar')
      return
    }
    if (scenarioPhase === BattlefieldScenarioPhase.FMCW_ANALYSIS) {
      setScenarioPhase(BattlefieldScenarioPhase.SCENARIO_COMPLETE)
      setScenarioNotice(BATTLEFIELD_SCENARIO_NOTICES.scenarioComplete)
      return
    }
    if (scenarioPhase === BattlefieldScenarioPhase.SCENARIO_COMPLETE) {
      handleResetScenario()
    }
  }, [applySensorSimulationStep, handleResetScenario, scenarioPhase, selectOperationRegion])

  const handleCycleBattlefieldSpeed = useCallback(() => {
    setBattlefieldSpeedIdx((prev) => {
      const next = (prev + 1) % BATTLEFIELD_SPEED_OPTIONS.length
      const multiplier = BATTLEFIELD_SPEED_OPTIONS[next] ?? 1
      setScenarioNotice(`시뮬레이션 배속 x${multiplier} 적용`)
      return next
    })
  }, [])

  const primaryScenarioCta = useMemo(() => {
    if (scenarioPhase === BattlefieldScenarioPhase.IDLE) {
      return { label: '작전 구역 선택', active: false, disabled: false, mode: 'action' as const }
    }
    if (scenarioPhase === BattlefieldScenarioPhase.REGION_SELECTED) {
      return { label: 'SAR 전개', active: false, disabled: false, mode: 'action' as const }
    }
    if (scenarioPhase === BattlefieldScenarioPhase.FMCW_ANALYSIS) {
      return { label: '시나리오 완료', active: true, disabled: false, mode: 'action' as const }
    }
    if (scenarioPhase === BattlefieldScenarioPhase.SCENARIO_COMPLETE) {
      return { label: '시나리오 다시 시작', active: false, disabled: false, mode: 'action' as const }
    }
    return {
      label: `배속 x${battlefieldSpeedMultiplier}`,
      active: true,
      disabled: false,
      mode: 'speed' as const,
    }
  }, [scenarioPhase, battlefieldSpeedMultiplier])

  const timelineControlEnabled = primaryScenarioCta.mode === 'speed'
  const timelineSliderMax = Math.max(0, timelineLength - 1)
  const timelineSliderCurrent = Math.min(timelineCursor, timelineSliderMax)
  const timelineProgressPct =
    timelineLength <= 1
      ? 0
      : Math.round((timelineSliderCurrent / Math.max(1, timelineSliderMax)) * 100)
  const timelineStatusLabel = timelineLength === 0 ? '0/0' : `${timelineCursor + 1}/${timelineLength}`
  const timelineHistoryAvailable = timelineControlEnabled && timelineLength > 1
  const playbackTimelineMax = 1000
  const playbackTimelineRatio = useMemo(() => {
    const ratios: number[] = []
    for (const entity of DUMMY_SCENARIO_ENTITIES) {
      if (entity.relation !== 'ENEMY' || entity.kind !== 'MBT') continue
      const cum = enemyMarchCumRef.current[entity.id]
      if (!cum || cum.length === 0) continue
      const totalM = cum[cum.length - 1] ?? 0
      if (!Number.isFinite(totalM) || totalM <= 1e-3) continue
      const curM = enemyMarchAlongMRef.current[entity.id] ?? 0
      ratios.push(Math.max(0, Math.min(1, curM / totalM)))
    }
    if (ratios.length === 0) return 0
    return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
  }, [enemyBattlefieldPoses])
  const playbackTimelineValue = Math.round(playbackTimelineRatio * playbackTimelineMax)
  const playbackTimelineTotalSec = useMemo(() => {
    const secs: number[] = []
    for (const entity of DUMMY_SCENARIO_ENTITIES) {
      if (entity.relation !== 'ENEMY' || entity.kind !== 'MBT') continue
      const cum = enemyMarchCumRef.current[entity.id]
      if (!cum || cum.length === 0) continue
      const totalM = cum[cum.length - 1] ?? 0
      if (!Number.isFinite(totalM) || totalM <= 1e-3) continue
      const speedMps = ((entity.speedKph * 1000) / 3600) * Math.max(0.1, BATTLEFIELD_ENEMY_MARCH_TIME_SCALE)
      if (!Number.isFinite(speedMps) || speedMps <= 1e-6) continue
      secs.push(totalM / speedMps)
    }
    if (secs.length === 0) return 0
    return Math.max(1, Math.round(Math.max(...secs)))
  }, [enemyBattlefieldPoses])
  const playbackTimelineEnabled = timelineControlEnabled && playbackTimelineTotalSec > 0
  const playbackTimelineClock = playbackTimelineEnabled
    ? `${formatSimClock(playbackTimelineRatio, playbackTimelineTotalSec)} / ${formatSimClock(1, playbackTimelineTotalSec)}`
    : '0:00 / 0:00'
  const playbackTimelinePct = Math.round(playbackTimelineRatio * 100)

  useEffect(() => {
    if (!timelineControlEnabled || simulationPaused || timelineApplyingRef.current) return
    const snapshot: SimulationTimelineSnapshot = {
      enemyBattlefieldPoses: cloneEnemyPoseMap(enemyBattlefieldPoses),
      enemyMarchAlongM: { ...enemyMarchAlongMRef.current },
      uavSimPos: uavSimPos ? { ...uavSimPos } : null,
      droneSimPos: droneSimPos ? { ...droneSimPos } : null,
      sensorState: cloneSensorState(sensorState),
    }
    const snapshots = timelineSnapshotsRef.current
    if (snapshots.length > 0) return
    snapshots.push(snapshot)
    timelineCursorRef.current = 0
    setTimelineCursor(0)
    setTimelineLength(1)
  }, [timelineControlEnabled, simulationPaused, enemyBattlefieldPoses, uavSimPos, droneSimPos, sensorState])

  useEffect(() => {
    if (timelineControlEnabled) return
    timelineSnapshotsRef.current = []
    timelineCursorRef.current = 0
    setTimelineCursor(0)
    setTimelineLength(0)
    setSimulationPaused(false)
  }, [timelineControlEnabled])

  const handleToggleSimulationPause = useCallback(() => {
    if (!timelineControlEnabled) return
    setSimulationPaused((prev) => {
      const next = !prev
      setScenarioNotice(next ? '시뮬레이션 일시정지' : '시뮬레이션 재개')
      return next
    })
  }, [timelineControlEnabled])

  const applyTimelineSnapshot = useCallback(
    (target: number, reason: 'back' | 'seek') => {
      if (!timelineControlEnabled) return
      const snapshots = timelineSnapshotsRef.current
      if (snapshots.length === 0) return
      const clamped = Math.max(0, Math.min(target, snapshots.length - 1))
      if (clamped === timelineCursorRef.current) return
      const snapshot = snapshots[clamped]
      if (!snapshot) return

      timelineApplyingRef.current = true
      setSimulationPaused(true)
      enemyMarchAlongMRef.current = { ...snapshot.enemyMarchAlongM }
      setGrdEnemyMotionAlert(null)
      setEnemyBattlefieldPoses(cloneEnemyPoseMap(snapshot.enemyBattlefieldPoses))
      const seededGrdInside: Record<number, Set<string>> = {}
      for (const entity of DUMMY_SCENARIO_ENTITIES) {
        if (entity.relation !== 'ENEMY' || entity.kind !== 'MBT') continue
        const pose = snapshot.enemyBattlefieldPoses[entity.id] ?? { lat: entity.lat, lng: entity.lng }
        const insideIds = findGrdMotionIdsContainingPoint(pose.lat, pose.lng)
        seededGrdInside[entity.id] = new Set(insideIds)
      }
      enemyPrevInsideGrdRef.current = seededGrdInside
      grdOverlayActivePrevRef.current = BATTLEFIELD_PHASE_MAP_FLAGS[scenarioPhaseRef.current].showSarGrdPeninsulaOverlay
      setUavSimPos(snapshot.uavSimPos ? { ...snapshot.uavSimPos } : null)
      setDroneSimPos(snapshot.droneSimPos ? { ...snapshot.droneSimPos } : null)
      setSensorState(cloneSensorState(snapshot.sensorState))
      timelineCursorRef.current = clamped
      setTimelineCursor(clamped)
      setTimelineLength(snapshots.length)
      if (reason === 'back') {
        setScenarioNotice(`타임라인 되돌리기 ${clamped + 1}/${snapshots.length}`)
      }
      window.setTimeout(() => {
        timelineApplyingRef.current = false
      }, 0)
    },
    [timelineControlEnabled],
  )

  const handleTimelineStepBack = useCallback(() => {
    applyTimelineSnapshot(timelineCursorRef.current - 1, 'back')
  }, [applyTimelineSnapshot])

  const handleTimelineJump = useCallback((delta: number) => {
    applyTimelineSnapshot(timelineCursorRef.current + delta, 'seek')
  }, [applyTimelineSnapshot])

  const handleTimelineSeek = useCallback((target: number) => {
    applyTimelineSnapshot(target, 'seek')
  }, [applyTimelineSnapshot])

  const handleTimelineSliderChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value)
    if (!Number.isFinite(next)) return
    handleTimelineSeek(next)
  }, [handleTimelineSeek])

  const handlePlaybackTimelineChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value)
    if (!Number.isFinite(raw)) return
    const ratio = Math.max(0, Math.min(1, raw / playbackTimelineMax))
    setEnemyBattlefieldPoses((prev) => {
      const next = { ...prev }
      let changed = false
      for (const entity of DUMMY_SCENARIO_ENTITIES) {
        if (entity.relation !== 'ENEMY' || entity.kind !== 'MBT') continue
        const poly = enemyMarchRoutesRef.current[entity.id]
        const cum = enemyMarchCumRef.current[entity.id]
        if (!poly || !cum || cum.length === 0) continue
        const maxM = Math.max(0, (cum[cum.length - 1] ?? 0) - 1e-6)
        const targetM = Math.max(0, Math.min(maxM, maxM * ratio))
        enemyMarchAlongMRef.current[entity.id] = targetM
        const pos = positionAlongPolylineM(poly, cum, targetM)
        next[entity.id] = pos
        changed = true
      }
      return changed ? next : prev
    })
  }, [])

  useEffect(() => {
    if (!scenarioNotice) return undefined
    const t = window.setTimeout(() => setScenarioNotice(null), 6500)
    return () => window.clearTimeout(t)
  }, [scenarioNotice])

  useEffect(() => {
    if (
      !sarSpotlightOpen &&
      sensorSimModalSensor == null &&
      !fmcwSummaryModalOpen &&
      grdEnemyMotionAlert == null &&
      !sarGrdVizModalOpen &&
      !uavDispatchModalOpen &&
      !uavVideoModal &&
      !assetStreamModal &&
      !droneInlineVideoPanel
    ) {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (uavDispatchModalOpen) {
        closeUavDispatchModal()
        return
      }
      if (uavVideoModal) {
        setUavVideoModal(null)
        return
      }
      if (assetStreamModal) {
        setAssetStreamModal(null)
        return
      }
      if (droneInlineVideoPanel) {
        setDroneInlineVideoPanel(null)
        return
      }
      if (sarGrdVizModalOpen) {
        setSarGrdVizModalOpen(false)
        return
      }
      if (fmcwSummaryModalOpen) {
        setFmcwSummaryModalOpen(false)
        return
      }
      if (sensorSimModalSensor != null) {
        setSensorSimModalSensor(null)
        return
      }
      if (grdEnemyMotionAlert != null) {
        setGrdEnemyMotionAlert(null)
        return
      }
      if (sarSpotlightOpen) {
        dismissSarSpotlight()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    sarSpotlightOpen,
    sensorSimModalSensor,
    fmcwSummaryModalOpen,
    grdEnemyMotionAlert,
    sarGrdVizModalOpen,
    uavDispatchModalOpen,
    uavVideoModal,
    assetStreamModal,
    droneInlineVideoPanel,
    closeUavDispatchModal,
    dismissSarSpotlight,
  ])

  const prevPhaseForSummaryRef = useRef(scenarioPhase)
  useEffect(() => {
    const prev = prevPhaseForSummaryRef.current
    prevPhaseForSummaryRef.current = scenarioPhase
    if (
      scenarioPhase === BattlefieldScenarioPhase.SCENARIO_COMPLETE &&
      prev !== BattlefieldScenarioPhase.SCENARIO_COMPLETE
    ) {
      setScenarioSummaryOpen(true)
    }
  }, [scenarioPhase])

  useEffect(() => {
    if (!scenarioSummaryOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setScenarioSummaryOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scenarioSummaryOpen])

  useEffect(() => {
    if (scenarioPhase !== BattlefieldScenarioPhase.SCENARIO_COMPLETE) {
      setScenarioSummaryOpen(false)
    }
  }, [scenarioPhase])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map?.getLayer(SERVICE_ENEMY_LAYER_ID)) return
    map.setPaintProperty(SERVICE_ENEMY_LAYER_ID, 'circle-radius', 7.2)
    map.setPaintProperty(SERVICE_ENEMY_LAYER_ID, 'circle-stroke-width', 1.8)
  }, [mapReady])

  const droneSplitViewActive = droneInlineVideoPanel != null

  return (
    <section className="page service-battlefield-page">
      <RiskOverlayLayer
        mapRef={mapRef}
        mapReady={mapReady}
        geoJson={riskGeoJson}
        showRiskZones={riskState.showRiskZones}
        showRiskTracks={riskState.showRiskTracks}
        onSelectCandidate={handleSelectRiskCandidate}
      />
      <AppShell splitClassName={`service-map-layout${droneSplitViewActive ? ' service-map-layout--drone-split' : ''}`}>
        <MapStage>
        <div className="service-map-shell">
          <div
            className="service-sensor-controls service-sensor-controls--overlay"
            role="group"
            aria-label="센서 시뮬레이션 설명 및 진행"
          >
            {(Object.keys(SENSOR_BUTTON_META) as ServiceSensorId[]).map((sensorId) => {
              const meta = SENSOR_BUTTON_META[sensorId]
              const running = sensorState[sensorId].running
              return (
                <button
                  key={sensorId}
                  type="button"
                  className={`service-sensor-btn${running ? ' service-sensor-btn--active' : ''}`}
                  title={
                    sensorId === 'sar'
                      ? 'GRD 데이터 시각화 · 지도 GRD 레이어 ON/OFF'
                      : sensorId === 'uav' || sensorId === 'drone'
                        ? `${meta.label} DB 자산 영상 보기`
                        : sensorId === 'fmcw'
                          ? `${meta.label} 결과 요약 보기`
                        : `${meta.label} 시뮬레이션 설명 보기`
                  }
                  onClick={() => {
                    if (sensorId === 'sar') {
                      setSarGrdVizModalOpen(true)
                      return
                    }
                    if (sensorId === 'uav' || sensorId === 'drone') {
                      openAssetStreamModal(sensorId)
                      return
                    }
                    if (sensorId === 'fmcw') {
                      setFmcwSummaryModalOpen(true)
                      return
                    }
                    setSensorSimModalSensor(sensorId)
                  }}
                  style={{
                    borderColor: meta.color,
                    boxShadow: running ? `0 0 0 1px ${meta.color}, 0 0 16px ${meta.color}55` : undefined,
                  }}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
          <div ref={mapContainerRef} className="service-map-canvas" />
          <div className="service-map-legend" aria-label="아군 적 우군 중립 범례">
            <span className="service-map-legend__item">
              <i style={{ backgroundColor: '#22c55e' }} />
              아(아군)
            </span>
            <span className="service-map-legend__item">
              <i style={{ backgroundColor: '#f43f5e' }} />
              적
            </span>
            <span className="service-map-legend__item">
              <i style={{ backgroundColor: '#38bdf8' }} />
              우(우군)
            </span>
            <span className="service-map-legend__item">
              <i style={{ backgroundColor: '#facc15' }} />
              중립
            </span>
            <span className="service-map-legend__item">
              <i style={{ backgroundColor: '#2563eb', opacity: 0.55 }} />
              GRD 이동 검출
            </span>
            {phaseAtLeast(scenarioPhase, BattlefieldScenarioPhase.FMCW_ANALYSIS) && (
              <>
                <span className="service-map-legend__item">
                  <i style={{ backgroundColor: '#f97316', opacity: 0.45 }} />
                  지상감시 레이더(FMCW) 위험구역
                </span>
                <span className="service-map-legend__item">
                  <i
                    style={{
                      backgroundColor: 'transparent',
                      border: '2px dashed #fb923c',
                      opacity: 0.95,
                    }}
                  />
                  이동 가능 축
                </span>
                <span className="service-map-legend__item">
                  <i style={{ backgroundColor: '#fb923c' }} />
                  추정 트랙
                </span>
              </>
            )}
          </div>
          <p className="service-cursor-readout">
            {cursorReadout
              ? `LAT ${cursorReadout.lat.toFixed(5)} · LNG ${cursorReadout.lng.toFixed(5)} · MGRS ${cursorReadout.mgrs}`
              : '지도 위 마우스 오버 시 좌표/MGRS 표시'}
          </p>
          {selectedDetail ? (
            <section
              className="service-panel-section service-selected-object-panel service-selected-object-panel--map-overlay"
              aria-label="선택 객체 상세 정보"
            >
              <h3>선택 객체 상세 정보</h3>
              <dl className="service-detail-dl">
                  <div>
                    <dt>객체</dt>
                    <dd>{selectedDetail.title}</dd>
                  </div>
                  <div>
                    <dt>소속</dt>
                    <dd>{selectedDetail.affiliation}</dd>
                  </div>
                  <div>
                    <dt>좌표</dt>
                    <dd>
                      {selectedDetail.lat.toFixed(5)}, {selectedDetail.lng.toFixed(5)}
                    </dd>
                  </div>
                  <div>
                    <dt>MGRS</dt>
                    <dd className="service-detail-dl__mono">{selectedDetail.mgrs}</dd>
                  </div>
                  {selectedDetail.unitCode && (
                    <div>
                      <dt>{selectedDetail.affiliation === '적' ? 'Track ID' : '식별번호'}</dt>
                      <dd className="service-detail-dl__mono">
                        {selectedDetail.affiliation === '적'
                          ? getTrackLabelLong(selectedDetail.unitCode)
                          : selectedDetail.unitCode}
                      </dd>
                    </div>
                  )}
                  {selectedDetail.speedKph != null && (
                    <div>
                      <dt>속도</dt>
                      <dd>{selectedDetail.speedKph.toFixed(1)} km/h</dd>
                    </div>
                  )}
                  {selectedDetail.headingDeg != null && (
                    <div>
                      <dt>방향</dt>
                      <dd>{selectedDetail.headingDeg.toFixed(1)}°</dd>
                    </div>
                  )}
                  {selectedDetail.riskLevel && (
                    <div>
                      <dt>위협도</dt>
                      <dd>{selectedDetail.riskLevel}</dd>
                    </div>
                  )}
                  <div>
                    <dt>요약</dt>
                    <dd>{selectedDetail.summary}</dd>
                  </div>
                  <div>
                    <dt>표고</dt>
                    <dd>{battlefieldPanelElevationM(selectedDetail)} m</dd>
                  </div>
                </dl>
                {selectedDetail.uavMvp && (
                  <div className="service-uav-mvp-detail">
                    <h4 className="service-uav-mvp-detail__title">UAV · EO/IR 확인 자산</h4>
                    <p className="muted service-uav-mvp-detail__sar">{selectedDetail.uavMvp.sarFollowupLine}</p>
                    <dl className="service-detail-dl">
                      <div>
                        <dt>운용 상태</dt>
                        <dd>{uavOpsStatusLabelKo(selectedDetail.uavMvp.opsStatus)}</dd>
                      </div>
                      <div>
                        <dt>EO/IR</dt>
                        <dd>
                          {selectedDetail.uavMvp.hasEoIr
                            ? `탑재 · ${selectedDetail.uavMvp.eoIrNote}`
                            : '없음'}
                        </dd>
                      </div>
                      <div>
                        <dt>전차 식별</dt>
                        <dd>
                          {selectedDetail.uavMvp.tankIdentification}
                          <div className="muted">{selectedDetail.uavMvp.identificationConfidence}</div>
                        </dd>
                      </div>
                      <div>
                        <dt>{selectedDetail.uavMvp.tankSpecLine}</dt>
                        <dd>{selectedDetail.uavMvp.tankSpecDetail}</dd>
                      </div>
                    </dl>
                    <div className="service-uav-mvp-inline-media">
                      {selectedDetail.uavMvp.mediaKind === 'video' ? (
                        <video
                          src={selectedDetail.uavMvp.mediaUrl}
                          controls
                          playsInline
                          muted
                          loop
                          className="service-uav-mvp-inline-media__video"
                        />
                      ) : (
                        <img
                          src={selectedDetail.uavMvp.mediaUrl}
                          alt=""
                          className="service-uav-mvp-inline-media__img"
                        />
                      )}
                      <p className="muted">{selectedDetail.uavMvp.mediaCaption}</p>
                    </div>
                  </div>
                )}
                {selectedDetail.droneMvp && (
                  <div className="service-drone-mvp-detail">
                    <h4 className="service-drone-mvp-detail__title">드론 · 근접 EO 정찰</h4>
                    <p className="muted service-drone-mvp-detail__ctx">{selectedDetail.droneMvp.afterUavContextLine}</p>
                    <dl className="service-detail-dl">
                      <div>
                        <dt>드론 ID</dt>
                        <dd>{selectedDetail.droneMvp.droneId}</dd>
                      </div>
                      <div>
                        <dt>임무 상태</dt>
                        <dd>{droneMissionStatusLabelKo(selectedDetail.droneMvp.missionStatus)}</dd>
                      </div>
                      <div>
                        <dt>드론–최근접 적(MB)</dt>
                        <dd>
                          {selectedDetail.droneMvp.distanceToNearestEnemyKm != null
                            ? `${selectedDetail.droneMvp.distanceToNearestEnemyKm.toFixed(1)} km`
                            : '계산 불가'}
                          <span className="muted">
                            {' '}
                            · 한계 {selectedDetail.droneMvp.identificationRangeKm} km
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>EO/IR 판별</dt>
                        <dd>
                          {selectedDetail.droneMvp.enemyIdentified
                            ? '가능 (거리 게이트 충족)'
                            : '불가 — 접근 필요'}
                        </dd>
                      </div>
                      <div>
                        <dt>표적 종류</dt>
                        <dd>{selectedDetail.droneMvp.targetClass}</dd>
                      </div>
                      <div>
                        <dt>이동 방향</dt>
                        <dd>{selectedDetail.droneMvp.headingDegEst.toFixed(1)}° (추정)</dd>
                      </div>
                      <div>
                        <dt>이동 상태</dt>
                        <dd>
                          {selectedDetail.droneMvp.movementState} · {selectedDetail.droneMvp.speedKphEst.toFixed(1)}{' '}
                          km/h
                        </dd>
                      </div>
                      <div>
                        <dt>위협도</dt>
                        <dd>{selectedDetail.droneMvp.threatLevel}</dd>
                      </div>
                    </dl>
                    <div className="service-drone-mvp-inline-media">
                      {selectedDetail.droneMvp.enemyIdentified && selectedDetail.droneMvp.mediaUrl ? (
                        selectedDetail.droneMvp.mediaKind === 'video' ? (
                          <video
                            src={selectedDetail.droneMvp.mediaUrl}
                            controls
                            playsInline
                            muted
                            loop
                            className="service-drone-mvp-inline-media__video"
                          />
                        ) : (
                          <img
                            src={selectedDetail.droneMvp.mediaUrl}
                            alt=""
                            className="service-drone-mvp-inline-media__img"
                          />
                        )
                      ) : null}
                      <p className="muted">{selectedDetail.droneMvp.mediaCaption}</p>
                    </div>
                  </div>
                )}
            </section>
          ) : null}
          {scenarioNotice && <p className="service-scenario-alert">{scenarioNotice}</p>}
          {uavDispatchModalOpen &&
            uavDispatchRequest &&
            createPortal(
              <div
                className="service-uav-dispatch-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby={uavDispatchModalTitleId}
                onClick={closeUavDispatchModal}
              >
                <div
                  className={`service-uav-dispatch-modal${uavDispatchRequest.kind === 'enemy' ? ' service-uav-dispatch-modal--enemy' : ''}`}
                  onClick={(event) => event.stopPropagation()}
                >
                <div className="service-uav-dispatch-modal__head">
                  <div>
                    <p className="service-uav-dispatch-modal__eyebrow">{dispatchAssetLabel} 출동 추천</p>
                    <h2 id={uavDispatchModalTitleId} className="service-uav-dispatch-modal__title">
                      {uavDispatchRequest.title}
                    </h2>
                    <p className="service-uav-dispatch-modal__sub">{uavDispatchRequest.summary}</p>
                  </div>
                  <button
                    type="button"
                    className="service-uav-dispatch-modal__close"
                    onClick={closeUavDispatchModal}
                    aria-label={`${dispatchAssetLabel} 추천 모달 닫기`}
                  >
                    ×
                  </button>
                </div>

                {uavDispatchRequest.kind === 'enemy' && (
                  <div className="service-uav-dispatch-modal__mode-toggle" role="tablist" aria-label="적 표적 행동 선택">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={enemyDispatchActiveMode === 'dispatch'}
                      className={`service-uav-dispatch-modal__mode-btn${enemyDispatchActiveMode === 'dispatch' ? ' service-uav-dispatch-modal__mode-btn--active' : ''}`}
                      onClick={() => setEnemyDispatchPanelMode('dispatch')}
                    >
                      드론 출동
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={enemyDispatchActiveMode === 'tactic'}
                      className={`service-uav-dispatch-modal__mode-btn${enemyDispatchActiveMode === 'tactic' ? ' service-uav-dispatch-modal__mode-btn--active' : ''}`}
                      onClick={() => setEnemyDispatchPanelMode('tactic')}
                      disabled={!enemyDispatchHasTacticMode}
                    >
                      대응 전술 선택
                    </button>
                  </div>
                )}

                <div
                  className={`service-uav-dispatch-modal__body${uavDispatchRequest.kind === 'enemy' ? ' service-uav-dispatch-modal__body--enemy' : ''}`}
                >
                  {uavDispatchRequest.kind === 'enemy' && (
                    <div className="service-uav-dispatch-modal__enemy-photo-card">
                      <p className="service-uav-dispatch-modal__section-label">표적 이미지</p>
                      <img
                        src={ENEMY_UAV_DISPATCH_REFERENCE_IMAGE_URL}
                        alt={`${uavDispatchRequest.enemyName ?? uavDispatchRequest.title} 관련 표적 이미지`}
                        className="service-uav-dispatch-modal__enemy-photo"
                      />
                      <p className="service-uav-dispatch-modal__enemy-photo-caption muted">
                        선택 표적 참고 이미지입니다.
                      </p>
                    </div>
                  )}

                  <div className="service-uav-dispatch-modal__content">
                    <div className="service-uav-dispatch-modal__target-card">
                      <p className="service-uav-dispatch-modal__section-label">목표 좌표</p>
                      <div className="service-uav-dispatch-modal__target-grid">
                        <span>
                          {uavDispatchRequest.lat.toFixed(5)}, {uavDispatchRequest.lng.toFixed(5)}
                        </span>
                        <span>{latLngToMgrsSafe(uavDispatchRequest.lat, uavDispatchRequest.lng)}</span>
                      </div>
                    </div>

                    {enemyDispatchActiveMode === 'dispatch' ? (
                      <>
                        {recommendedUavDispatch && (
                          <div className="service-uav-dispatch-modal__recommend-card">
                            <p className="service-uav-dispatch-modal__section-label">자동 추천</p>
                            <div className="service-uav-dispatch-modal__recommend-top">
                              <strong>{recommendedUavDispatch.name}</strong>
                              <span className="service-uav-dispatch-modal__recommend-score">
                                종합 점수 {recommendedUavDispatch.totalScore.toFixed(0)}
                              </span>
                            </div>
                            <p className="service-uav-dispatch-modal__recommend-meta">
                              거리 {recommendedUavDispatch.distanceKm.toFixed(1)}km · ETA{' '}
                              {formatEtaMinutes(recommendedUavDispatch.etaMin)} · 준비태세{' '}
                              {recommendedUavDispatch.readiness}
                            </p>
                            <ul className="service-uav-dispatch-modal__reason-list">
                              {recommendedUavDispatch.reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div
                          className="service-uav-dispatch-modal__candidate-list"
                          role="radiogroup"
                          aria-label={`출동 ${dispatchAssetLabel} 선택`}
                        >
                          {uavDispatchCandidates.map((candidate) => {
                            const selected = candidate.id === selectedUavDispatchId
                            const isRecommended = recommendedUavDispatch?.id === candidate.id
                            return (
                              <label
                                key={candidate.id}
                                className={`service-uav-dispatch-modal__candidate${selected ? ' service-uav-dispatch-modal__candidate--selected' : ''}`}
                              >
                                <input
                                  type="radio"
                                  name="service-uav-dispatch-candidate"
                                  checked={selected}
                                  onChange={() => setSelectedUavDispatchId(candidate.id)}
                                />
                                <div className="service-uav-dispatch-modal__candidate-body">
                                  <div className="service-uav-dispatch-modal__candidate-top">
                                    <strong>{candidate.name}</strong>
                                    <span className="service-uav-dispatch-modal__candidate-tag">
                                      {isRecommended
                                        ? '추천'
                                        : candidate.inRange
                                          ? '출동 가능'
                                          : '거리 초과'}
                                    </span>
                                  </div>
                                  <p className="service-uav-dispatch-modal__candidate-meta">
                                    거리 {candidate.distanceKm.toFixed(1)}km · ETA {formatEtaMinutes(candidate.etaMin)} · 준비태세{' '}
                                    {candidate.readiness}
                                  </p>
                                  <p className="service-uav-dispatch-modal__candidate-mission">
                                    {candidate.mission}
                                  </p>
                                </div>
                              </label>
                            )
                          })}
                          {uavDispatchCandidates.length === 0 && (
                            <p className="service-uav-dispatch-modal__empty">
                              추천 가능한 아군 {dispatchAssetLabel}이(가) 없습니다.
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="service-uav-dispatch-modal__tactic-list" role="group" aria-label="대응 전술 선택">
                        {enemyDispatchTacticRows.map((row) => {
                          const selected = selectedEnemyTacticNames.includes(row.name)
                          return (
                            <label
                              key={row.name}
                              className={`service-uav-dispatch-modal__tactic${selected ? ' service-uav-dispatch-modal__tactic--selected' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => handleToggleEnemyTactic(row.name)}
                              />
                              <div className="service-uav-dispatch-modal__tactic-body">
                                <div className="service-uav-dispatch-modal__candidate-top">
                                  <strong>{row.name}</strong>
                                  <span className="service-uav-dispatch-modal__candidate-tag">
                                    점수 {row.score}
                                  </span>
                                </div>
                                <p className="service-uav-dispatch-modal__candidate-meta">{row.rationale}</p>
                              </div>
                            </label>
                          )
                        })}
                        {enemyDispatchTacticRows.length === 0 && (
                          <p className="service-uav-dispatch-modal__empty">
                            선택 가능한 대응 전술이 아직 계산되지 않았습니다.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="service-uav-dispatch-modal__footer">
                  <p className="service-uav-dispatch-modal__footnote">
                    {enemyDispatchActiveMode === 'tactic'
                      ? '복수 전술 선택 가능 · 적용 시 우측 전술 카드/영상에 반영됩니다.'
                      : '추천 기준: 거리, 준비태세, EO/IR 임무 적합도, 운용 인원'}
                  </p>
                  <div className="service-uav-dispatch-modal__actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={closeUavDispatchModal}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={
                        enemyDispatchActiveMode === 'tactic'
                          ? enemyDispatchTacticRows.length === 0
                          : !selectedUavDispatchCandidate
                      }
                      onClick={
                        enemyDispatchActiveMode === 'tactic'
                          ? handleApplyEnemyTactics
                          : handleConfirmUavDispatch
                      }
                    >
                      {enemyDispatchActiveMode === 'tactic'
                        ? `선택 전술 적용 (${Math.max(1, selectedEnemyTacticNames.length)})`
                        : selectedUavDispatchCandidate &&
                            recommendedUavDispatch &&
                            selectedUavDispatchCandidate.id !== recommendedUavDispatch.id
                          ? `선택 ${dispatchAssetLabel} 출동`
                          : `추천 ${dispatchAssetLabel} 출동`}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
              document.body,
            )}
          {uavVideoModal &&
            createPortal(
              <div
                className="map-video-modal-backdrop"
                role="presentation"
                onClick={() => setUavVideoModal(null)}
              >
                <div
                  className="map-video-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={uavVideoModalTitleId}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="map-video-modal-head">
                    <div>
                      <h2 id={uavVideoModalTitleId} className="map-video-modal-title">
                        {uavVideoModal.title}
                      </h2>
                      {uavVideoModal.subtitle ? (
                        <p className="map-video-modal-sub muted">{uavVideoModal.subtitle}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="map-video-modal-close"
                      aria-label="닫기"
                      onClick={() => setUavVideoModal(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="map-video-modal-body">
                    {uavVideoModal.videoUrl ? (
                      <video
                        key={uavVideoModal.videoUrl}
                        className="map-video-modal-video"
                        src={uavVideoModal.videoUrl}
                        controls
                        autoPlay
                        playsInline
                      >
                        브라우저가 video 태그를 지원하지 않습니다.
                      </video>
                    ) : (
                      <p className="map-video-modal-empty muted">등록된 영상 URL이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )}
          {assetStreamModal &&
            createPortal(
              <div
                className="map-video-modal-backdrop"
                role="presentation"
                onClick={() => setAssetStreamModal(null)}
              >
                <div
                  className="map-video-modal map-video-modal--asset-stream"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={assetStreamModalTitleId}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="map-video-modal-head">
                    <div>
                      <h2 id={assetStreamModalTitleId} className="map-video-modal-title">
                        {assetStreamModal.sensor === 'uav' ? 'UAV(EO/IR) 실시간 영상' : '드론 근접 실시간 영상'}
                      </h2>
                      <p className="map-video-modal-sub muted">
                        DB 자산 현황의 {assetStreamModal.sensor === 'uav' ? 'UAV' : '드론'} 자산별로 영상을 선택해 재생할 수
                        있습니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="map-video-modal-close"
                      aria-label="닫기"
                      onClick={() => setAssetStreamModal(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="service-asset-stream-modal__body">
                    <aside className="service-asset-stream-modal__list">
                      {assetStreamCandidates.length > 0 ? (
                        assetStreamCandidates.map((asset) => {
                          const selected = selectedAssetStream?.id === asset.id
                          return (
                            <button
                              key={asset.id}
                              type="button"
                              className={`service-asset-stream-modal__item${selected ? ' service-asset-stream-modal__item--selected' : ''}`}
                              onClick={() =>
                                setAssetStreamModal((prev) =>
                                  prev == null ? prev : { ...prev, selectedAssetId: asset.id },
                                )
                              }
                            >
                              <strong>{asset.name}</strong>
                              <span className="muted">{asset.mgrs}</span>
                            </button>
                          )
                        })
                      ) : (
                        <p className="map-video-modal-empty muted">해당 카테고리 자산이 없습니다.</p>
                      )}
                    </aside>
                    <div className="service-asset-stream-modal__player">
                      {selectedAssetStream?.streamVideoUrl ? (
                        <video
                          key={`${selectedAssetStream.id}-${selectedAssetStream.streamVideoUrl}`}
                          className="map-video-modal-video"
                          src={selectedAssetStream.streamVideoUrl}
                          controls
                          autoPlay
                          playsInline
                        >
                          브라우저가 video 태그를 지원하지 않습니다.
                        </video>
                      ) : (
                        <p className="map-video-modal-empty muted">재생 가능한 영상 URL이 없습니다.</p>
                      )}
                      {selectedAssetStream && (
                        <p className="service-asset-stream-modal__caption muted">
                          선택 자산: {selectedAssetStream.name} · 준비태세 {selectedAssetStream.readiness}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="service-asset-stream-modal__footer">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAssetStreamModal(null)}
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setAssetStreamModal(null)
                        setSensorSimModalSensor(assetStreamModal.sensor)
                      }}
                    >
                      {SENSOR_BUTTON_META[assetStreamModal.sensor].label} 시뮬레이션 설명 열기
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
          {assetLoading && <p className="service-overlay-message">DB 자산 로딩 중…</p>}
          {assetError && <p className="service-overlay-message service-overlay-message--error">{assetError}</p>}
        </div>
        {phaseAtLeast(scenarioPhase, BattlefieldScenarioPhase.FMCW_ANALYSIS) && (
          <FmcwServiceDock bundle={fmcwMvpBundle} />
        )}
        </MapStage>

        <ScenarioSidebar hidden={droneSplitViewActive}>
          <section className="service-panel-section">
            <div className="service-sim-control">
              <div className="service-sim-control__row">
                <button
                  type="button"
                  className={`service-start-scenario-btn service-start-scenario-btn--compact${primaryScenarioCta.active ? ' service-start-scenario-btn--active' : ''}`}
                  onClick={
                    primaryScenarioCta.mode === 'speed'
                      ? handleCycleBattlefieldSpeed
                      : handlePrimaryScenarioAction
                  }
                  disabled={primaryScenarioCta.disabled}
                  title={primaryScenarioCta.mode === 'speed' ? '클릭 시 배속 순환: x1 → x2 → x4' : undefined}
                >
                  {primaryScenarioCta.label}
                </button>
                {timelineControlEnabled && (
                  <button
                    type="button"
                    className="btn-secondary service-sim-control__aux-btn"
                    onClick={handleToggleSimulationPause}
                    title={simulationPaused ? '시뮬레이션 재개' : '시뮬레이션 일시정지'}
                  >
                    {simulationPaused ? '재개' : '일시정지'}
                  </button>
                )}
              </div>
              {timelineControlEnabled && (
                <div className="service-sim-control__playback">
                  <div className="service-sim-control__playback-head">
                    <span className="service-sim-control__playback-label">재생</span>
                    <span className="service-sim-control__playback-clock">{playbackTimelineClock}</span>
                  </div>
                  <input
                    type="range"
                    className="service-sim-control__playback-slider"
                    min={0}
                    max={playbackTimelineMax}
                    step={1}
                    value={playbackTimelineValue}
                    onChange={handlePlaybackTimelineChange}
                    disabled={!playbackTimelineEnabled}
                    style={{
                      background: `linear-gradient(90deg, #22c55e 0%, #22c55e ${playbackTimelinePct}%, #334155 ${playbackTimelinePct}%, #334155 100%)`,
                    }}
                    aria-label="영상 재생 타임라인 이동"
                  />
                </div>
              )}
              {timelineHistoryAvailable && (
                <div className="service-sim-control__timeline">
                  <div className="service-sim-control__timeline-head">
                    <div className="service-sim-control__timeline-meta">
                      <span className="service-sim-control__timeline-status">타임라인 {timelineStatusLabel}</span>
                      <span className="service-sim-control__timeline-percent">{timelineProgressPct}%</span>
                    </div>
                    <div className="service-sim-control__timeline-jog">
                      <button
                        type="button"
                        className="btn-secondary service-sim-control__timeline-btn"
                        onClick={() => handleTimelineJump(-5)}
                        disabled={timelineCursor <= 0}
                        title="5프레임 이전으로 이동"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        className="btn-secondary service-sim-control__timeline-btn"
                        onClick={handleTimelineStepBack}
                        disabled={timelineCursor <= 0}
                        title="타임라인 한 단계 되돌리기"
                      >
                        되돌리기
                      </button>
                      <button
                        type="button"
                        className="btn-secondary service-sim-control__timeline-btn"
                        onClick={() => handleTimelineJump(5)}
                        disabled={timelineCursor >= timelineSliderMax}
                        title="5프레임 이후로 이동"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    className="service-sim-control__timeline-slider"
                    min={0}
                    max={timelineSliderMax}
                    step={1}
                    value={timelineSliderCurrent}
                    style={{
                      background: `linear-gradient(90deg, #22c55e 0%, #22c55e ${timelineProgressPct}%, #334155 ${timelineProgressPct}%, #334155 100%)`,
                    }}
                    onChange={handleTimelineSliderChange}
                    disabled={timelineLength <= 1}
                    aria-label="시뮬레이션 타임라인 이동"
                  />
                  <div className="service-sim-control__timeline-scale">
                    <span>초기</span>
                    <span>{timelineProgressPct}% 지점</span>
                    <span>실시간</span>
                  </div>
                </div>
              )}
              {grdEnemyMotionAlert && (
                <div
                  className="service-sar-move-notice"
                  role="button"
                  tabIndex={0}
                  aria-labelledby={grdMotionAlertTitleId}
                  onClick={handleOpenGrdEnemyMotionVideo}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleOpenGrdEnemyMotionVideo()
                    }
                  }}
                >
                  <div className="service-sar-move-notice__head">
                    <strong id={grdMotionAlertTitleId} className="service-sar-move-notice__title">
                      SAR 이동 알림
                    </strong>
                    <span className="service-sar-move-notice__badge">영상</span>
                  </div>
                  <p className="service-sar-move-notice__body">
                    <strong>{grdEnemyAlertCompactName}</strong> 남하 포착
                  </p>
                  <div className="service-sar-move-notice__actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(event) => {
                        event.stopPropagation()
                        setGrdEnemyMotionAlert(null)
                      }}
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleOpenGrdEnemyMotionVideo()
                      }}
                    >
                      재생
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="service-panel-section">
            <h2>자산 현황</h2>
            <ul className="service-asset-summary">
              {(Object.keys(SERVICE_CATEGORY_LABEL) as ServiceAssetCategory[])
                .filter((category) => category !== 'SAR')
                .map((category) => (
                <li key={category} className="service-asset-group">
                  <button
                    type="button"
                    className={`service-asset-group-head${activeCategory === category ? ' service-asset-group-head--active' : ''}`}
                    onClick={() => handleCategoryClick(category)}
                  >
                    <span
                      className="service-asset-dot"
                      style={{ backgroundColor: SERVICE_CATEGORY_COLOR[category] }}
                    />
                    <strong>{SERVICE_CATEGORY_LABEL[category]}</strong>
                    <span>{grouped[category].length}개</span>
                  </button>
                  {activeCategory === category && (
                    <ul className="service-asset-items">
                      {grouped[category].map((asset) => {
                        const isActiveUav =
                          category === 'UAV' &&
                          activeDispatchedUav?.id === asset.id &&
                          sensorState.uav.running &&
                          uavSimPos != null
                        const isActiveDrone =
                          category === 'DRONE' &&
                          activeDispatchedDroneId === asset.id &&
                          sensorState.drone.running &&
                          droneSimPos != null
                        const isReturnTarget = isActiveUav || isActiveDrone
                        const isDroneCategory = category === 'DRONE'
                        const isUavCategory = category === 'UAV'
                        const isInlineReturnCategory = isDroneCategory || isUavCategory
                        return (
                          <li key={asset.id}>
                            {isInlineReturnCategory ? (
                              <div
                                className={`service-asset-item-btn service-asset-item-btn--drone${selectedAssetId === asset.id ? ' service-asset-item-btn--active' : ''}`}
                              >
                                <div className="service-asset-item-drone-row">
                                  <button
                                    type="button"
                                    className="service-asset-item-main-btn service-asset-item-main-btn--drone"
                                    onClick={() => handleAssetClick(asset)}
                                  >
                                    <span className="service-asset-item-btn__name">{asset.name}</span>
                                    <span className="service-asset-item-btn__code">
                                      식별번호 {asset.unitCode}
                                    </span>
                                    {isActiveUav && (
                                      <span className="service-asset-item-btn__status">
                                        사용중 · {activeUavDispatchTargetText ?? '목표 갱신 중'}
                                      </span>
                                    )}
                                    {isActiveDrone && <span className="service-asset-item-btn__status">사용중 · 표적 추적 중</span>}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary service-asset-item-return-btn service-asset-item-return-btn--inline"
                                    disabled={!isReturnTarget}
                                    title={
                                      isReturnTarget
                                        ? `${asset.name}을(를) 최초 위치로 회항`
                                        : `${asset.name}은(는) 현재 출동 중이 아닙니다.`
                                    }
                                    onClick={() => handleReturnAssetToBase(asset)}
                                  >
                                    회항
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`service-asset-item-btn${selectedAssetId === asset.id ? ' service-asset-item-btn--active' : ''}`}
                                onClick={() => handleAssetClick(asset)}
                              >
                                <span className="service-asset-item-btn__name">{asset.name}</span>
                                <span className="service-asset-item-btn__code">
                                  식별번호 {asset.unitCode}
                                </span>
                                {isActiveUav && (
                                  <span className="service-asset-item-btn__status">
                                    사용중 · {activeUavDispatchTargetText ?? '목표 갱신 중'}
                                  </span>
                                )}
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            <div className="service-layer-toggle">
              <div className="service-layer-toggle__master">
                <button
                  type="button"
                  className={`btn-secondary service-layer-toggle__master-btn${allMapLayersOn ? ' service-layer-toggle__master-btn--on' : ''}`}
                  onClick={toggleAllMapLayers}
                >
                  {allMapLayersOn ? '지도 객체 전체 끄기' : '지도 객체 전체 켜기'}
                </button>
                <p className="service-layer-toggle__master-hint">
                  아군·적·우군·중립 및 적 식별번호(지표) 레이어를 한 번에 켜거나 끕니다.
                </p>
              </div>
              <p className="service-layer-toggle__title">레이어 on/off</p>
              <div className="service-layer-toggle__grid">
                {(Object.keys(LAYER_TOGGLE_LABEL) as LayerToggleKey[]).map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={layerVisible[key]}
                      onChange={() => toggleLayer(key)}
                    />
                    {LAYER_TOGGLE_LABEL[key]}
                  </label>
                ))}
              </div>
            </div>

            <div className="service-map-style-editor">
              <p className="service-map-style-editor__title">Google 지도 스타일</p>
              <div className="service-map-style-editor__preset-grid">
                {(Object.keys(GOOGLE_BASE_PRESETS) as GoogleBasePresetId[]).map((presetId) => (
                  <button
                    key={presetId}
                    type="button"
                    className={`service-map-style-editor__preset-btn${baseMapPreset === presetId ? ' service-map-style-editor__preset-btn--active' : ''}`}
                    onClick={() => setBaseMapPreset(presetId)}
                  >
                    {GOOGLE_BASE_PRESETS[presetId].label}
                  </button>
                ))}
              </div>
              <div className="service-map-style-editor__sliders">
                <label>
                  밝기 ({rasterTuning.brightness})
                  <input
                    type="range"
                    min={-60}
                    max={60}
                    step={5}
                    value={rasterTuning.brightness}
                    onChange={(event) => handleRasterTuningChange('brightness', Number(event.target.value))}
                  />
                </label>
                <label>
                  대비 ({rasterTuning.contrast})
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={rasterTuning.contrast}
                    onChange={(event) => handleRasterTuningChange('contrast', Number(event.target.value))}
                  />
                </label>
                <label>
                  채도 ({rasterTuning.saturation})
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={rasterTuning.saturation}
                    onChange={(event) => handleRasterTuningChange('saturation', Number(event.target.value))}
                  />
                </label>
                <label>
                  색상 회전 ({rasterTuning.hue}°)
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={rasterTuning.hue}
                    onChange={(event) => handleRasterTuningChange('hue', Number(event.target.value))}
                  />
                </label>
                <label>
                  투명도 ({rasterTuning.opacity}%)
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={5}
                    value={rasterTuning.opacity}
                    onChange={(event) => handleRasterTuningChange('opacity', Number(event.target.value))}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-secondary service-map-style-editor__reset-btn"
                onClick={handleRasterTuningReset}
              >
                스타일 조정 초기화
              </button>
            </div>
          </section>

          {uavMvpHudSnapshot && (
            <section className="service-panel-section service-uav-hud-section">
              <h3>UAV 임무 요약 · SAR 후속 확인</h3>
              <p className="service-uav-hud-section__flow muted">{uavMvpHudSnapshot.sarFollowupLine}</p>
              <dl className="service-detail-dl">
                <div>
                  <dt>콜사인</dt>
                  <dd>{uavMvpHudSnapshot.callSign}</dd>
                </div>
                <div>
                  <dt>플랫폼</dt>
                  <dd>{uavMvpHudSnapshot.platformId}</dd>
                </div>
                <div>
                  <dt>운용 상태</dt>
                  <dd>{uavOpsStatusLabelKo(uavMvpHudSnapshot.opsStatus)}</dd>
                </div>
                <div>
                  <dt>EO/IR</dt>
                  <dd>
                    {uavMvpHudSnapshot.hasEoIr
                      ? `탑재 · ${uavMvpHudSnapshot.eoIrNote}`
                      : '없음'}
                  </dd>
                </div>
                <div>
                  <dt>식별(추정)</dt>
                  <dd>
                    {uavMvpHudSnapshot.tankIdentification}
                    <span className="muted"> · {uavMvpHudSnapshot.identificationConfidence}</span>
                  </dd>
                </div>
                <div>
                  <dt>위치 · 속도 · 방향</dt>
                  <dd>
                    {uavMvpHudSnapshot.lat.toFixed(5)}, {uavMvpHudSnapshot.lng.toFixed(5)}
                    <span className="service-detail-dl__mono"> · {uavMvpHudSnapshot.mgrs}</span>
                    <br />
                    {uavMvpHudSnapshot.speedKphEst.toFixed(0)} km/h · {uavMvpHudSnapshot.headingDegEst.toFixed(0)}°
                  </dd>
                </div>
              </dl>
              <p className="muted service-uav-hud-section__hint">
                지도의 UAV 이동 마커(청색 원)에 마우스를 올리면 팝업이, 클릭하면 이 패널에 EO/IR 영상과 전차 스펙이
                펼쳐집니다.
              </p>
            </section>
          )}

          {droneMvpHudSnapshot && (
            <section className="service-panel-section service-drone-hud-section">
              <h3>드론 근접 정찰 · UAV 후속</h3>
              <p className="service-drone-hud-section__flow muted">{droneMvpHudSnapshot.afterUavContextLine}</p>
              <dl className="service-detail-dl">
                <div>
                  <dt>드론 ID</dt>
                  <dd>{droneMvpHudSnapshot.droneId}</dd>
                </div>
                <div>
                  <dt>임무 상태</dt>
                  <dd>{droneMissionStatusLabelKo(droneMvpHudSnapshot.missionStatus)}</dd>
                </div>
                <div>
                  <dt>드론–최근접 적(MB)</dt>
                  <dd>
                    {droneMvpHudSnapshot.distanceToNearestEnemyKm != null
                      ? `${droneMvpHudSnapshot.distanceToNearestEnemyKm.toFixed(1)} km`
                      : '계산 불가'}
                    <span className="muted">
                      {' '}
                      · 식별 한계 {droneMvpHudSnapshot.identificationRangeKm} km
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>EO/IR 판별</dt>
                  <dd>
                    {droneMvpHudSnapshot.enemyIdentified
                      ? '가능 (거리 게이트 충족)'
                      : '불가 — 적 MBT에 더 접근 필요'}
                  </dd>
                </div>
                <div>
                  <dt>표적 종류</dt>
                  <dd>{droneMvpHudSnapshot.targetClass}</dd>
                </div>
                <div>
                  <dt>이동 방향 · 속도</dt>
                  <dd>
                    {droneMvpHudSnapshot.headingDegEst.toFixed(0)}° · {droneMvpHudSnapshot.speedKphEst.toFixed(0)} km/h
                  </dd>
                </div>
                <div>
                  <dt>이동 상태</dt>
                  <dd>{droneMvpHudSnapshot.movementState}</dd>
                </div>
                <div>
                  <dt>위협도</dt>
                  <dd>{droneMvpHudSnapshot.threatLevel}</dd>
                </div>
                <div>
                  <dt>위치</dt>
                  <dd>
                    {droneMvpHudSnapshot.lat.toFixed(5)}, {droneMvpHudSnapshot.lng.toFixed(5)}
                    <span className="service-detail-dl__mono"> · {droneMvpHudSnapshot.mgrs}</span>
                  </dd>
                </div>
              </dl>
              <p className="muted service-drone-hud-section__hint">
                지도의 드론 마커(자홍색·두꺼운 링)는 UAV보다 저고도·근거리 정찰 자산입니다. 적 MBT와의 거리가{' '}
                {droneMvpHudSnapshot.identificationRangeKm}
                km 이하일 때만 EO/IR로 표적 종류·위협을 판별합니다(사거리는{' '}
                <code className="service-detail-dl__mono">battlefield/droneEngagementConfig.ts</code>에서 변경).
              </p>
            </section>
          )}

          {phaseAtLeast(scenarioPhase, BattlefieldScenarioPhase.FMCW_ANALYSIS) && (
            <section className="service-panel-section service-fmcw-hud-section">
              <h3>지상감시 레이더(FMCW) · 위험구역 &amp; 아군 타격</h3>
              <p className="muted service-fmcw-hud-section__lead">{fmcwMvpBundle.zoneLabel}</p>
              <dl className="service-detail-dl">
                <div>
                  <dt>탐지 거리</dt>
                  <dd>{fmcwMvpBundle.detectionRangeKm.toFixed(1)} km</dd>
                </div>
                <div>
                  <dt>접근 속도</dt>
                  <dd>{fmcwMvpBundle.approachSpeedMps.toFixed(1)} m/s</dd>
                </div>
                <div>
                  <dt>이동 가능 축</dt>
                  <dd>{fmcwMvpBundle.ingressSummary}</dd>
                </div>
              </dl>
              <p className="service-fmcw-hud-section__sub">아군 자산별 타격 가능(규칙 기반 추정)</p>
              <ul className="service-fmcw-engage-list">
                {fmcwMvpBundle.engagements.slice(0, 12).map((row, idx) => (
                  <li
                    key={`fmcw-eng-${idx}-${row.assetName}`}
                    className={
                      row.strikeCapable
                        ? 'service-fmcw-engage-list__item service-fmcw-engage-list__item--ok'
                        : 'service-fmcw-engage-list__item service-fmcw-engage-list__item--no'
                    }
                  >
                    <div className="service-fmcw-engage-list__head">
                      <strong>{row.assetName}</strong>
                      <span>{row.strikeCapable ? '타격 가능' : '타격 불가'}</span>
                    </div>
                    <p className="muted">
                      {row.category} · 위험구역 기준 {row.distanceKm.toFixed(1)} km
                    </p>
                    <p className="service-fmcw-engage-list__why">{row.rationale}</p>
                  </li>
                ))}
              </ul>
              <p className="muted service-fmcw-hud-section__hint">
                지도에 주황 위험 면·진입 점선·트랙 점이 표시됩니다. 면 위에 마우스를 올리면 요약 팝업이 뜹니다. 하단
                독에서 리포트·트랙·BEV를 확인하세요.
              </p>
            </section>
          )}

          <section className="service-panel-section">
            <h3>전술 대응 적합도</h3>
            {tacticScores && tacticScores.length > 0 ? (
              <ul className="service-tactic-list">
                {tacticScores.map((row, rankIdx) => {
                  const rankClass =
                    rankIdx === 0
                      ? 'service-tactic-list__item--r1'
                      : rankIdx === 1
                        ? 'service-tactic-list__item--r2'
                        : 'service-tactic-list__item--r3'
                  const pct = Math.min(100, Math.max(0, row.score))
                  return (
                    <li key={row.name} className={`service-tactic-list__item ${rankClass}`}>
                      <div className="service-tactic-list__head">
                        <strong>{row.name}</strong>
                        <span>{row.score}점</span>
                      </div>
                      <div
                        className="service-tactic-list__meter"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={`${row.score}점`}
                        aria-label={`${row.name} 적합도`}
                      >
                        <div className="service-tactic-list__meter-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p>{row.rationale}</p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted">
                적 객체에 마우스를 올리면 정보 팝업이 표시되고, 클릭하면 전술 대응 적합도가 활성화됩니다. SAR 단계 이후 적
                전차(MBT)를 클릭하면 SAR·탐지 파이프라인 처리 영상을 볼 수 있습니다.
              </p>
            )}
          </section>
        </ScenarioSidebar>
        {droneSplitViewActive && droneInlineVideoPanel && (
          <aside className="service-drone-split-panel" role="region" aria-label="드론 정찰 분할 영상">
            <div className="service-drone-split-panel__head">
              <div>
                <strong className="service-drone-split-panel__title">{droneInlineVideoPanel.title}</strong>
                <p className="service-drone-split-panel__hint muted">좌측 지도 · 우측 드론 정찰 영상 분할 보기</p>
              </div>
              <button
                type="button"
                className="btn-secondary service-drone-split-panel__back"
                onClick={() => setDroneInlineVideoPanel(null)}
              >
                돌아가기
              </button>
            </div>
            <div className="service-drone-split-panel__viewer">
              <video
                key={`${droneInlineVideoPanel.assetId}-${droneInlineVideoPanel.videoUrl}`}
                className="service-drone-split-panel__video"
                src={droneInlineVideoPanel.videoUrl}
                controls
                autoPlay
                muted
                playsInline
              >
                브라우저가 video 태그를 지원하지 않습니다.
              </video>
            </div>
          </aside>
        )}
      </AppShell>

      {sarSpotlightOpen &&
        createPortal(
          <div
            className={`sar-spotlight-root${sarSpotlightEmphasis ? ' sar-spotlight-root--emphasis' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sar-spotlight-title"
          >
            <div
              className="sar-spotlight-backdrop"
              role="presentation"
              onClick={dismissSarSpotlight}
            />
            <div className="sar-spotlight-modal sar-spotlight-modal--glow">
              <div className="sar-spotlight-modal__chrome">
                <div className="sar-spotlight-modal__head" id="sar-spotlight-title">
                  Spotlight · SAR 관측 구역 강조
                </div>
                <button
                  type="button"
                  className="sar-spotlight-modal__close"
                  aria-label="Spotlight 닫기"
                  onClick={dismissSarSpotlight}
                >
                  ×
                </button>
              </div>
              <p className="sar-spotlight-modal__sub">{SAR_SPOTLIGHT_MODAL_SUB}</p>
              <div className="sar-spotlight-modal__body">
                <img src={SAR_SPOTLIGHT_RESULT_IMAGE_URL} alt="SAR 적 인식 결과" />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {sarGrdVizModalOpen &&
        createPortal(
          <div
            className="scenario-summary-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby={sarGrdVizModalTitleId}
          >
            <div
              className="scenario-summary-backdrop"
              role="presentation"
              onClick={() => setSarGrdVizModalOpen(false)}
            />
            <div className="scenario-summary-modal service-sar-grd-viz-modal">
              <div className="scenario-summary-modal__chrome">
                <div className="scenario-summary-modal__head">
                  <h2 id={sarGrdVizModalTitleId}>GRD 데이터 시각화</h2>
                  <button
                    type="button"
                    className="scenario-summary-modal__close"
                    aria-label="GRD 시각화 닫기"
                    onClick={() => setSarGrdVizModalOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <p className="scenario-summary-modal__sub muted">
                  SAR·GRD 데이터 시각화. 지도의 파란 이동 검출 면은 우측 토글로 켜고 끌 수 있습니다.
                </p>
              </div>
              <div className="scenario-summary-modal__body service-sar-grd-viz-modal__body">
                <div className="service-sar-grd-viz-modal__figure">
                  <img
                    src={SAR_GRD_VISUALIZATION_IMAGE_URL}
                    alt="SAR·GRD 데이터 시각화(연안·관심구역 표시)"
                  />
                </div>
                <div className="service-sar-grd-viz-toggle">
                  <span className="service-sar-grd-viz-toggle__label" id={sarGrdMapToggleLabelId}>
                    GRD 이동 검출(파란색 박스)
                  </span>
                  <button
                    type="button"
                    className={`service-sar-grd-viz-toggle__switch${grdMotionMapOverlayOn ? ' service-sar-grd-viz-toggle__switch--on' : ''}`}
                    role="switch"
                    aria-checked={grdMotionMapOverlayOn}
                    aria-labelledby={sarGrdMapToggleLabelId}
                    onClick={() => setGrdMotionMapOverlayOn((v) => !v)}
                  >
                    {grdMotionMapOverlayOn ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              <div className="scenario-summary-modal__footer">
                <button type="button" className="btn-secondary" onClick={() => setSarGrdVizModalOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {fmcwSummaryModalOpen &&
        createPortal(
          <div
            className="scenario-summary-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby={fmcwSummaryModalTitleId}
          >
            <div
              className="scenario-summary-backdrop"
              role="presentation"
              onClick={() => setFmcwSummaryModalOpen(false)}
            />
            <div className="scenario-summary-modal service-sensor-sim-modal">
              <div className="scenario-summary-modal__chrome">
                <div className="scenario-summary-modal__head">
                  <h2 id={fmcwSummaryModalTitleId}>지상감시 레이더(FMCW) 결과 요약</h2>
                  <button
                    type="button"
                    className="scenario-summary-modal__close"
                    aria-label="FMCW 결과 요약 닫기"
                    onClick={() => setFmcwSummaryModalOpen(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="scenario-summary-modal__body">
                <div className="service-fmcw-summary-tabs" role="tablist" aria-label="FMCW 분석 보기 선택">
                  <button
                    type="button"
                    className={fmcwSummarySection === 'point' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setFmcwSummarySection('point')}
                  >
                    BEV
                  </button>
                </div>
                {fmcwSummarySection === 'point' && (
                <section className="scenario-summary-section">
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 10,
                    }}
                  >
                    {fmcwSummarySnapshot.bevByRadar.map((row) => (
                      <button
                        key={row.radarId}
                        type="button"
                        className={row.radarId === (activeFmcwBev?.radarId ?? -1) ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setFmcwBevRadarId(row.radarId)}
                      >
                        {row.radarName} ({row.pointCount})
                      </button>
                    ))}
                  </div>
                  {activeFmcwBev && activeFmcwBevPointInfos.length > 0 ? (
                    <>
                      <div
                        style={{
                          border: '1px solid #334155',
                          borderRadius: 10,
                          background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
                          padding: 8,
                        }}
                      >
                        <svg viewBox="0 0 320 210" width="100%" role="img" aria-label="FMCW BEV 추정 좌표">
                          <rect x="0" y="0" width="320" height="210" fill="transparent" />
                          {[0, 1, 2, 3, 4].map((idx) => {
                            const y = 18 + idx * 42
                            return (
                              <line
                                key={`bev-grid-y-${idx}`}
                                x1="22"
                                y1={String(y)}
                                x2="308"
                                y2={String(y)}
                                stroke="#334155"
                                strokeDasharray="2 3"
                                strokeWidth="1"
                              />
                            )
                          })}
                          {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
                            const x = 22 + idx * 47.666
                            return (
                              <line
                                key={`bev-grid-x-${idx}`}
                                x1={String(x)}
                                y1="18"
                                x2={String(x)}
                                y2="186"
                                stroke="#334155"
                                strokeDasharray="2 3"
                                strokeWidth="1"
                              />
                            )
                          })}
                          <line x1="165" y1="18" x2="165" y2="186" stroke="#94a3b8" strokeWidth="1.2" />
                          <line x1="22" y1="186" x2="308" y2="186" stroke="#94a3b8" strokeWidth="1.2" />
                          {activeFmcwBevPointInfos.map((point, idx) => {
                            const xNorm =
                              165 + Math.max(-1, Math.min(1, point.yKm / (activeFmcwBev.bevHalfWidthKm || 1))) * 138
                            const yNorm =
                              186 - Math.max(0, Math.min(1, point.xKm / (activeFmcwBev.bevMaxForwardKm || 1))) * 165
                            const pointColor =
                              point.riskLevel === '높음' ? '#fb7185' : point.riskLevel === '중간' ? '#fbbf24' : '#38bdf8'
                            return (
                              <g key={`${point.name}-${idx}`}>
                                <circle cx={xNorm} cy={yNorm} r="5.5" fill={pointColor} stroke="#e2e8f0" strokeWidth="1.2" />
                                <text
                                  x={xNorm + 7}
                                  y={yNorm + 3}
                                  fill="#e2e8f0"
                                  fontSize="10"
                                  fontWeight="700"
                                >
                                  {idx + 1}
                                </text>
                              </g>
                            )
                          })}
                        </svg>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <div className="service-sensor-sim-modal__text">
                          탐지 {activeFmcwBevPointInfos.length}개 · 최근접{' '}
                          {activeFmcwBevStats.nearestKm != null ? `${activeFmcwBevStats.nearestKm.toFixed(1)}km` : '-'}
                        </div>
                        <div className="service-sensor-sim-modal__text">
                          평균 거리{' '}
                          {activeFmcwBevStats.avgDistanceKm != null
                            ? `${activeFmcwBevStats.avgDistanceKm.toFixed(1)}km`
                            : '-'}{' '}
                          · 최원거리{' '}
                          {activeFmcwBevStats.farthestKm != null
                            ? `${activeFmcwBevStats.farthestKm.toFixed(1)}km`
                            : '-'}
                        </div>
                        <div className="service-sensor-sim-modal__text">
                          평균 속도{' '}
                          {activeFmcwBevStats.avgSpeedKph != null
                            ? `${activeFmcwBevStats.avgSpeedKph.toFixed(1)}km/h`
                            : '-'}
                        </div>
                      </div>
                      <ul className="scenario-summary-bullets" style={{ marginTop: 10 }}>
                        {activeFmcwBevPointInfos.map((point, idx) => {
                          const sideLabel =
                            point.relativeBearingDeg >= 0
                              ? `우측 ${Math.abs(point.relativeBearingDeg).toFixed(0)}°`
                              : `좌측 ${Math.abs(point.relativeBearingDeg).toFixed(0)}°`
                          return (
                            <li key={`${point.name}-bev-info-${idx}`}>
                              [{idx + 1}] {point.name} · 거리 {point.distanceKm.toFixed(1)}km · 방위 {sideLabel} · 속도{' '}
                              {point.speedKph.toFixed(1)}km/h · 위험 {point.riskLevel} · 기동{' '}
                              {headingToDirectionKo(point.headingDeg)}({point.headingDeg.toFixed(0)}°)
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="muted service-sensor-sim-modal__text">현재 선택 레이더에 표시할 탐지 객체가 없습니다.</p>
                  )}
                </section>
                )}
                {fmcwSummarySection === 'axis' && (
                <section className="scenario-summary-section">
                  <h3>예상 기동 방향 / 이동 가능 축</h3>
                  {!fmcwPredictionRouteOn ? (
                    <p className="muted service-sensor-sim-modal__text">
                      이동 가능 축 예측이 OFF 상태입니다. 스위치를 ON으로 바꾸면 지도와 요약에 반영됩니다.
                    </p>
                  ) : (
                    <>
                      <p className="muted service-sensor-sim-modal__text">
                        파란 선·점은 지나온 지점(3프레임), 적색 선·점은 앞으로의 예측 지점입니다.
                      </p>
                      {fmcwSummarySnapshot.frameDominantBearingDeg != null && (
                        <p className="muted service-sensor-sim-modal__text">
                          대표 이동 방향: {headingToDirectionKo(fmcwSummarySnapshot.frameDominantBearingDeg)}(
                          {fmcwSummarySnapshot.frameDominantBearingDeg.toFixed(0)}°)
                        </p>
                      )}
                      {fmcwSummarySnapshot.framePredictedLines.length > 0 ? (
                        <ul className="scenario-summary-bullets">
                          {fmcwSummarySnapshot.framePredictedLines.map((line) => (
                            <li key={`${line.label}-${line.bearingDeg.toFixed(0)}`}>
                              {line.label} · 방위 {line.bearingDeg.toFixed(0)}° · 예측 길이 {line.lengthKm.toFixed(1)}km
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted service-sensor-sim-modal__text">
                          3프레임 기반 이동경로를 계산할 탐지 이력이 아직 부족합니다.
                        </p>
                      )}
                    </>
                  )}
                </section>
                )}
                {fmcwSummarySection === 'risk' && (
                <section className="scenario-summary-section">
                  <h3>위험구역 추정</h3>
                  {!fmcwPredictionRiskOn ? (
                    <p className="muted service-sensor-sim-modal__text">
                      위험지역 예측이 OFF 상태입니다. 스위치를 ON으로 바꾸면 지도와 요약에 반영됩니다.
                    </p>
                  ) : (
                    <>
                      <p>
                        3프레임 기반 미래 위험구역 <strong>{fmcwSummarySnapshot.riskZoneCount}</strong>개
                      </p>
                      <p className="muted service-sensor-sim-modal__text">
                        주/대안 경로 확률을 합성해 “어디가 몇 분 뒤 위험해지는지”를 계산한 결과입니다.
                      </p>
                      {fmcwSummarySnapshot.riskZoneEstimates.length > 0 && (
                        <ul className="scenario-summary-bullets">
                          {fmcwSummarySnapshot.riskZoneEstimates.map((risk, idx) => (
                            <li key={`risk-zone-${idx}`}>
                              위험도 {risk.riskScore.toFixed(0)} · 도달확률 {risk.probabilityPct.toFixed(0)}% · 예상{' '}
                              {risk.etaMin != null ? `t+${risk.etaMin.toFixed(1)}분` : '시각 계산중'} · 표적{' '}
                              {risk.targetCount}개
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </section>
                )}
                <div className="service-fmcw-summary-bottom-controls">
                  <div className="service-sar-grd-viz-toggle">
                    <span className="service-sar-grd-viz-toggle__label" id={fmcwCoverageToggleLabelId}>
                      지상감지 레이더 탐지 범위(부채꼴)
                    </span>
                    <button
                      type="button"
                      className={`service-sar-grd-viz-toggle__switch${fmcwCoverageOn ? ' service-sar-grd-viz-toggle__switch--on' : ''}`}
                      role="switch"
                      aria-checked={fmcwCoverageOn}
                      aria-labelledby={fmcwCoverageToggleLabelId}
                      onClick={() => setFmcwCoverageOn((v) => !v)}
                    >
                      {fmcwCoverageOn ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="service-sar-grd-viz-toggle">
                    <span className="service-sar-grd-viz-toggle__label" id={fmcwRouteToggleLabelId}>
                      이동 가능 축 예측
                    </span>
                    <button
                      type="button"
                      className={`service-sar-grd-viz-toggle__switch${fmcwPredictionRouteOn ? ' service-sar-grd-viz-toggle__switch--on' : ''}`}
                      role="switch"
                      aria-checked={fmcwPredictionRouteOn}
                      aria-labelledby={fmcwRouteToggleLabelId}
                      onClick={() => setFmcwPredictionRouteOn((v) => !v)}
                    >
                      {fmcwPredictionRouteOn ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="service-sar-grd-viz-toggle">
                    <span className="service-sar-grd-viz-toggle__label" id={fmcwRiskToggleLabelId}>
                      위험지역 예측
                    </span>
                    <button
                      type="button"
                      className={`service-sar-grd-viz-toggle__switch${fmcwPredictionRiskOn ? ' service-sar-grd-viz-toggle__switch--on' : ''}`}
                      role="switch"
                      aria-checked={fmcwPredictionRiskOn}
                      aria-labelledby={fmcwRiskToggleLabelId}
                      onClick={() => setFmcwPredictionRiskOn((v) => !v)}
                    >
                      {fmcwPredictionRiskOn ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="scenario-summary-modal__footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFmcwSummaryModalOpen(false)}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {sensorSimModalSensor != null &&
        createPortal(
          <div
            className="scenario-summary-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby={sensorSimModalTitleId}
          >
            <div
              className="scenario-summary-backdrop"
              role="presentation"
              onClick={() => setSensorSimModalSensor(null)}
            />
            <div className="scenario-summary-modal service-sensor-sim-modal">
              <div className="scenario-summary-modal__chrome">
                <div className="scenario-summary-modal__head">
                  <h2 id={sensorSimModalTitleId}>
                    {SERVICE_SENSOR_SIMULATION_HELP[sensorSimModalSensor].title}
                  </h2>
                  <button
                    type="button"
                    className="scenario-summary-modal__close"
                    aria-label="시뮬레이션 설명 닫기"
                    onClick={() => setSensorSimModalSensor(null)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="scenario-summary-modal__body">
                {sensorSimModalSensor === 'fmcw' ? (
                  <>
                    <ExperimentModePanel
                      riskState={riskState}
                      updateRiskState={updateRiskState}
                      summaries={RISK_E2E_PIPELINE_SUMMARY}
                      totalCount={riskSummary.totalCount}
                    />
                    <section className="service-panel-section risk-pipeline-note">
                      <h3>운영 문맥</h3>
                      <p className="muted">
                        기본 preset은 ops_t15 저부담 모드이며, full 모드는 후보 수가 많아 연구/분석 맥락에서 사용합니다.
                      </p>
                      <p className="muted">
                        suppression 기준: raw {RISK_E2E_SUPPRESSION_SUMMARY.rawHdbscanCandidates} → full{' '}
                        {RISK_E2E_SUPPRESSION_SUMMARY.fullAfterSuppression} → ops_t15{' '}
                        {RISK_E2E_SUPPRESSION_SUMMARY.opsT15AfterSuppression}
                      </p>
                    </section>
                    <RightInfoPanel
                      riskState={riskState}
                      topCandidates={topCandidates}
                      selectedCandidateId={selectedRiskCandidateId}
                      selectedCandidate={selectedRiskCandidate}
                      onSelectCandidate={handleSelectRiskCandidate}
                    />
                  </>
                ) : (
                  <>
                    <p className="service-sensor-sim-modal__text">
                      {SERVICE_SENSOR_SIMULATION_HELP[sensorSimModalSensor].description}
                    </p>
                    <p className="muted service-sensor-sim-modal__text">
                      {SERVICE_SENSOR_SIMULATION_FOOTNOTE}
                    </p>
                  </>
                )}
                {!sensorSimProceed.canProceed && sensorSimProceed.hint != null && (
                  <p className="service-sensor-sim-modal__hint" role="status">
                    {sensorSimProceed.hint}
                  </p>
                )}
              </div>
              <div className="scenario-summary-modal__footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSensorSimModalSensor(null)}
                >
                  닫기
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!sensorSimProceed.canProceed}
                  title={sensorSimProceed.hint ?? undefined}
                  onClick={handleSensorSimulationModalProceed}
                >
                  시뮬레이션 진행
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {scenarioSummaryOpen &&
        scenarioPhase === BattlefieldScenarioPhase.SCENARIO_COMPLETE &&
        createPortal(
          <div
            className="scenario-summary-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby={scenarioSummaryTitleId}
          >
            <div
              className="scenario-summary-backdrop"
              role="presentation"
              onClick={() => setScenarioSummaryOpen(false)}
            />
            <div className="scenario-summary-modal">
              <div className="scenario-summary-modal__chrome">
                <div className="scenario-summary-modal__head">
                  <h2 id={scenarioSummaryTitleId}>{scenarioSummaryReport.title}</h2>
                  <button
                    type="button"
                    className="scenario-summary-modal__close"
                    aria-label="요약 닫기"
                    onClick={() => setScenarioSummaryOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <p className="scenario-summary-modal__sub muted">{scenarioSummaryReport.subtitle}</p>
              </div>
              <div className="scenario-summary-modal__body">
                <section className="scenario-summary-section">
                  <h3>단계별 탐지 결과</h3>
                  <ol className="scenario-summary-phases">
                    {scenarioSummaryReport.phaseResults.map((row) => (
                      <li key={row.stepLabel}>
                        <span className="scenario-summary-phases__label">{row.stepLabel}</span>
                        <strong>{row.headline}</strong>
                        <p className="muted">{row.detail}</p>
                      </li>
                    ))}
                  </ol>
                </section>
                <div className="scenario-summary-grid">
                  <section className="scenario-summary-section">
                    <h3>최종 식별 · 적 전차(MBT)</h3>
                    <p className="scenario-summary-highlight">
                      <span className="scenario-summary-highlight__num">{scenarioSummaryReport.finalEnemyMbtCount}</span>
                      <span className="scenario-summary-highlight__unit">개 군집</span>
                    </p>
                    <p className="muted">{scenarioSummaryReport.finalEnemyMbtDetail}</p>
                  </section>
                  <section className="scenario-summary-section">
                    <h3>{scenarioSummaryReport.movementPathTitle}</h3>
                    <ul className="scenario-summary-bullets">
                      {scenarioSummaryReport.movementPathSteps.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <p className="muted scenario-summary-note">{scenarioSummaryReport.movementPathNote}</p>
                  </section>
                </div>
                <section className="scenario-summary-section">
                  <h3>{scenarioSummaryReport.dangerZoneTitle}</h3>
                  <p>{scenarioSummaryReport.dangerZoneDetail}</p>
                  <p className="scenario-summary-fmcw-line">
                    <span className="muted">FMCW 윤곽: </span>
                    {scenarioSummaryReport.dangerZoneFmcwLine}
                  </p>
                  <p className="muted">
                    아군 타격 적합도: {scenarioSummaryReport.strikeSuitabilityPct}% · 예상 진입:{' '}
                    {fmcwMvpBundle.ingressSummary}
                  </p>
                </section>
                <section className="scenario-summary-section">
                  <h3>대응 적합 전술</h3>
                  <ul className="scenario-summary-tactics">
                    {scenarioSummaryReport.tactics.map((t) => (
                      <li key={t.name}>
                        <div className="scenario-summary-tactics__head">
                          <strong>{t.name}</strong>
                          <span>{t.score}점</span>
                        </div>
                        <p>{t.rationale}</p>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="scenario-summary-section">
                  <h3>자산별 기여도</h3>
                  <ul className="scenario-summary-contrib">
                    {scenarioSummaryReport.assetContributions.map((row) => (
                      <li key={row.label}>
                        <div className="scenario-summary-contrib__head">
                          <span>
                            <strong>{row.label}</strong>
                            <span className="muted"> · {row.category}</span>
                          </span>
                          <span className="scenario-summary-contrib__pct">{row.contributionPct}%</span>
                        </div>
                        <div className="scenario-summary-contrib__bar" aria-hidden>
                          <span style={{ width: `${row.contributionPct}%` }} />
                        </div>
                        <p className="muted">{row.note}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <div className="scenario-summary-modal__footer">
                <button type="button" className="btn-secondary" onClick={() => setScenarioSummaryOpen(false)}>
                  닫기
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    handleResetScenario()
                  }}
                >
                  시나리오 다시 시작
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}

function RequireAuth({ user, authReady }: RequireAuthProps) {
  if (!authReady) {
    return (
      <section className="page auth-page auth-checking-page">
        <h1>인증 상태 확인 중…</h1>
      </section>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function AppLayout({ user, onLogout }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  useEffect(() => {
    const onSimStarted = () => setSidebarCollapsed(true)
    window.addEventListener(SIM_STARTED_EVENT, onSimStarted)
    return () => window.removeEventListener(SIM_STARTED_EVENT, onSimStarted)
  }, [])

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <h2 className="brand">전장 C2 서비스</h2>
        <nav className="sidebar-nav">
          <p className="sidebar-nav-group-label">운용</p>
          <NavLink to="/" end>
            실시간 전장판
          </NavLink>
          <NavLink to="/scenario-playback">시나리오 재생</NavLink>
        </nav>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <div>
            <strong>제어와드</strong>
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="btn-secondary topbar-sidebar-toggle"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            </button>
            {user ? (
              <>
                <span className="user-email">{user.email}</span>
                <button type="button" className="btn-secondary" onClick={onLogout}>
                  로그아웃
                </button>
              </>
            ) : (
              <nav className="auth-links">
                <NavLink to="/login">로그인</NavLink>
                <NavLink to="/signup">회원가입</NavLink>
              </nav>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AuthLayout({
  user,
  authReady,
}: {
  user: User | null
  authReady: boolean
}) {
  if (!authReady) {
    return (
      <div className="auth-shell auth-shell--satellite">
        <section className="page auth-page auth-page--center auth-page--glass auth-checking-page">
          <h1>인증 상태 확인 중…</h1>
        </section>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-shell auth-shell--satellite">
      <section className="page auth-page auth-page--center auth-page--glass">
        <Outlet />
      </section>
    </div>
  )
}

function LoginPage({ onLoggedIn }: LoginPageProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('demo@hanhwa.local')
  const [password, setPassword] = useState('Demo1234!')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = useMemo(
    () => isSubmitting || !email.trim() || !password.trim(),
    [email, isSubmitting, password],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await requestJson<AuthResponse>(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      onLoggedIn(result)
      navigate('/')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '로그인에 실패했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <h1>로그인</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="이메일"
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="최소 8자"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary auth-login-btn" disabled={isDisabled}>
          {isSubmitting ? '로그인 중...' : '로그인'}
        </button>
        <Link to="/signup" className="auth-signup-btn">
          회원가입
        </Link>
      </form>
    </>
  )
}

function SignupPage({ onSignedUp }: SignupPageProps) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = useMemo(
    () => isSubmitting || !email.trim() || password.trim().length < 8,
    [email, isSubmitting, password],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await requestJson<AuthResponse>(`${getApiBaseUrl()}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      onSignedUp(result)
      navigate('/')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '회원가입에 실패했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <h1>회원가입</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          이름(선택)
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름"
          />
        </label>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="이메일"
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="최소 8자"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={isDisabled}>
          {isSubmitting ? '가입 중...' : '회원가입'}
        </button>
      </form>
    </>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('accessToken'),
  )
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(() => localStorage.getItem('accessToken') == null)

  useEffect(() => {
    if (!token) {
      setUser(null)
      setAuthReady(true)
      return
    }

    setAuthReady(false)
    void requestJson<User>(`${getApiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((result) => setUser(result))
      .catch(() => {
        localStorage.removeItem('accessToken')
        setUser(null)
        setToken(null)
      })
      .finally(() => {
        setAuthReady(true)
      })
  }, [token])

  const handleAuthSuccess = (payload: AuthResponse) => {
    localStorage.setItem('accessToken', payload.accessToken)
    setToken(payload.accessToken)
    setUser(payload.user)
    setAuthReady(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    setToken(null)
    setUser(null)
    setAuthReady(true)
  }

  return (
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
  )
}

export default App
