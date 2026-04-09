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
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { AlertZonePage } from './AlertZonePage'
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
  BATTALION_PYONGYANG_INVASION_ORIGIN,
  BATTALION_ROUTE_CORRIDOR_REVEAL_MS,
  BATTALION_SCENARIO,
  isBattalionC2Unit,
  isEnemyNearDmz38,
  pickPrimaryEnemyForDistance,
  SAR_ENEMY_BLIP_PROGRESS,
  SAR_WIDE_SCAN_PAUSE_PROGRESS,
  SCENARIO_RANGES_KM,
} from './scenarioBattalion'
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

type MapVideoModalState = {
  title: string
  subtitle?: string
  videoUrl: string | null
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
  branch: string
  lat: number
  lng: number
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
 * 평양→남한 시연용 궤적: 구면 대원호(slerp) + smoothstep.
 * OSRM 도로는 분계·북측 데이터 한계로 꺾임·우회가 커져 체감이 어색할 수 있어 시뮬에는 사용하지 않음.
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
  const pyOrigin = BATTALION_PYONGYANG_INVASION_ORIGIN
  enemies.forEach((e) => {
    if (primary && e.id === primary.id) {
      enemy.set(
        e.id,
        buildGreatCircleInvasionPath(pyOrigin.lat, pyOrigin.lng, inv.lat, inv.lng, e.id * 23 + e.codename.length),
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

/** 시뮬 시계 기준 궤적 접선 속도(km/h) — 아군 고정 궤적이면 0에 가깝게 */
function speedAlongPathKmH(path: SimPoint[], progress: number): number | null {
  if (path.length < 2) return null
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

/** 주 적: 평양→남한 자연스러운 남하 — 대원호 보간만 사용(OSRM 제외) */
async function fetchRoadInvasionPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  seed: number,
): Promise<{ points: SimPoint[]; fromRoad: boolean }> {
  return {
    points: buildGreatCircleInvasionPath(fromLat, fromLng, toLat, toLng, seed),
    fromRoad: false,
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
  const pyOrigin = BATTALION_PYONGYANG_INVASION_ORIGIN

  units.forEach((u) => {
    friendly.set(u.id, buildFriendlyPath(u.lat, u.lng, u.id * 17 + u.name.length))
  })

  enemies.forEach((e) => {
    jobs.push(
      (async () => {
        if (primaryEnemy && e.id === primaryEnemy.id) {
          const { points, fromRoad } = await fetchRoadInvasionPath(
            pyOrigin.lat,
            pyOrigin.lng,
            inv.lat,
            inv.lng,
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

  units.forEach(({ id, pin, info }) => {
    const path = paths.friendly.get(id)
    if (!path) return
    const { lat, lng } = samplePath(path, progress)
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

  const axisVisible = opts?.enemyVisible !== false
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

    unitScene.push({ id: unit.id, pin: pinOverlay, info: infoOverlay })
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
          openMapVideoModalRef.current({
            title: enemy.codename,
            subtitle: `적군 · ${enemy.threatLevel} · ${enemy.enemyBranch}`,
            videoUrl: enemy.droneVideoUrl || null,
          })
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
            <p class="map-hover-minimal-line">우선 표적 · 클릭 시 영상</p>
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
            <p class="map-hover-video-hint">클릭하면 정찰 영상</p>
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
        openMapVideoModalRef.current({
          title: enemy.codename,
          subtitle: `적군 · ${enemy.threatLevel} · ${enemy.enemyBranch}`,
          videoUrl: enemy.droneVideoUrl || null,
        })
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
  const scenarioStep = useMemo((): 0 | 1 | 2 | 3 | 4 => {
    const q = searchParams.get('scenario')
    const n = q != null && q !== '' ? parseInt(q, 10) : NaN
    if (!Number.isFinite(n) || n < 1) return 0
    if (n >= 5) return 4
    return n as 0 | 1 | 2 | 3 | 4
  }, [searchParams])
  const setScenarioStep = useCallback(
    (step: 0 | 1 | 2 | 3 | 4) => {
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
    if (scenarioStep !== 4 || !simPaths) return null
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
    if (scenarioStep !== 4) return 'sat-watch'
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

  const enemyFullPinOnMap =
    scenarioStep !== 4 ||
    scenarioV2Phase === 'tactical-mid' ||
    scenarioV2Phase === 'fmcw-drone-transit' ||
    scenarioV2Phase === 'tactics'

  /** SAR 남하 권역에서 궤적 포착 후 ~ UAV 승인·이동·광역 추적까지는 소형 블립만 */
  const enemySarTrackVisible =
    scenarioStep === 4 &&
    simProgress >= enemyCorridorEntryProgress &&
    (uavLaunchStartProgress != null ||
      scenarioV2Phase === 'sat-watch' ||
      scenarioV2Phase === 'sat-wide-pause')

  const enemyMapVisible = scenarioStep !== 4 || enemyFullPinOnMap || enemySarTrackVisible

  const enemyDotOnlyOnMap =
    scenarioStep === 4 && enemySarTrackVisible && !enemyFullPinOnMap

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
    scenarioStep === 4 &&
    tacticalSubStep >= 4 &&
    sarContact &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.TACTICAL_RANGE_KM

  const fmcwInRange =
    scenarioStep === 4 &&
    tacticalSubStep >= 5 &&
    sarContact &&
    radarSnapshot != null &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.FMCW_MAX

  /** C2 기준 ≤15km + SAR 접촉 — 정찰 드론 출동·EO/IR 촬영·전송 */
  const droneDispatchActive =
    scenarioStep === 4 &&
    sarContact &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM

  /** FMCW: ≤15km 부채꼴·상세 탐지·예측 경로 */
  const radarFmcwForMap = fmcwInRange ? radarSnapshot : null

  const insetMinimal =
    sarContact &&
    scenarioStep === 4 &&
    tacticalSubStep >= 4 &&
    enemyDistanceKm != null &&
    enemyDistanceKm > SCENARIO_RANGES_KM.FMCW_MAX &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.TACTICAL_RANGE_KM

  const mapUiActive =
    scenarioStep === 4 && (tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare')

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
    if (scenarioStep !== 4) {
      setUavEnemyVideoExpanded(false)
      return
    }
    // 재구성 시나리오에서는 SAR 접촉을 기본 전제로 두고 센서 단계를 진행.
    if (!sarContact) setSarContact(true)
  }, [scenarioStep, sarContact])

  useEffect(() => {
    if (scenarioStep !== 4 || !simPaths) return
    if (uavLaunchStartProgress != null) return
    // 최초 진입 시 자동 재생하지 않고, 사용자가 버튼을 눌렀을 때만 진행.
    if (simProgress >= wideScanPauseProgress && simPlaying) {
      setSimPlaying(false)
    }
  }, [scenarioStep, simPaths, uavLaunchStartProgress, simProgress, simPlaying, wideScanPauseProgress])

  useEffect(() => {
    if (scenarioStep !== 4) return
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
    if (scenarioStep !== 4) {
      setUavLaunchStartProgress(null)
      setDroneLaunchStartProgress(null)
      setUavEnemyVideoExpanded(false)
      setTacticSaveMessage(null)
      setSelectedTacticUnit(null)
      setTacticDecisionNote('')
      setTacticRecommendations([])
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

  const radarSnapshotRef = useRef<RadarSnapshot | null>(null)
  radarSnapshotRef.current = radarSnapshot

  const radarDiscoveryAnnouncedRef = useRef(false)
  const [enemyRadarDiscovered, setEnemyRadarDiscovered] = useState(false)
  const [enemyNearDmz38, setEnemyNearDmz38] = useState(false)
  const enemyNearDmzPrevRef = useRef(false)

  const simFrameOptsRef = useRef<ApplySimFrameOpts | undefined>(undefined)
  simFrameOptsRef.current = {
    radarSite: (radarSnapshot?.fmcw.radar as RadarSite) ?? null,
    primaryEnemyId: primaryEnemyForSim?.id ?? null,
    sarContact,
    enemyVisible: enemyMapVisible,
    enemyDotOnly: enemyDotOnlyOnMap,
    scenarioIntegratedSimActive: scenarioStep === 4,
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
  }

  useEffect(() => {
    if (scenarioStep !== 4 || enemyDistanceKm == null) return
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
    if (!noMapRadarSync || scenarioStep !== 4 || !simPaths || !primaryEnemyForSim) {
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
  }, [simPaths, c2UnitForSim?.id, primaryEnemyForSim?.id])

  const handleLaunchUavFromBattalion = useCallback(() => {
    if (scenarioStep !== 4) return
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
    scenarioStep === 4 &&
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
    scenarioStep !== 4 ||
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

    if (scenarioStep !== 4 || !mapUiActive) {
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

        if (c2Unit && primaryEnemy && sarContact && scenarioStep === 4) {
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
    if (scenarioStep !== 4 || !mapUiActive) return
    sceneRef.current?.battalionRegionsSync?.(simProgress)
  }, [scenarioStep, simProgress, mapUiActive])

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
            <strong>0</strong> 요약 → <strong>1~3</strong> 단계별 센서 → <strong>4</strong> 통합 상황(40km/15km 전환).
          </>
        ) : scenarioStep === 1 ? (
          <>1단계: SAR 광역 탐지·변화분석.</>
        ) : scenarioStep === 2 ? (
          <>2단계: UAV 실시간 추적·EO/IR.</>
        ) : scenarioStep === 3 ? (
          <>3단계: FMCW·VoD 근거리 레이더.</>
        ) : (
          <>
            4단계: 통합 상황 — C2 기준 <strong>40km</strong> 전술 권역, <strong>15km</strong> FMCW.
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
          {tacticalSimPoints && primaryEnemyForSim && c2UnitForSim ? (
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

        {tacticSupportPopoverOpen && scenarioV2Phase === 'tactics' && (
          <>
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
            >
              <div className="tactic-popover__head">
                <div className="tactic-popover__head-text">
                  <p className="tactic-popover__badge">지휘결심 지원</p>
                  <h3 id={tacticPopoverTitleId} className="tactic-popover__title">
                    전술 선택
                  </h3>
                  <p className="muted tactic-popover__lead">
                    화면 중앙에서 전술을 선택합니다. 배경을 누르거나 닫기로 접을 수 있습니다.
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
                          onChange={() => setSelectedTacticUnit(rec.unitName)}
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
          </>
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

        {scenarioStep === 4 &&
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
        {enemyRadarDiscovered && scenarioStep === 4 && tacticalSubStep >= 5 && (
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
        {scenarioStep === 4 && fmcwInRange && (
          <div className="scenario-red-alert" role="alert">
            <span className="scenario-red-alert__badge">FMCW</span>
            <span>
              <strong>FMCW 활성</strong> — 방위·예측 궤적 표시. 드론: 지도/카드에서 재생.
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
                        src={primaryEnemyForSim.droneVideoUrl}
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
            aria-label="FMCW 레이더 표적 Range–Azimuth"
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
                setMapVideoModal({
                  title: mapEnemyAssetHover.codename,
                  subtitle: `적군 · ${mapEnemyAssetHover.threatLevel} · ${mapEnemyAssetHover.enemyBranch}`,
                  videoUrl: mapEnemyAssetHover.droneVideoUrl || null,
                })
              }}
            >
              드론 정찰 영상
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
              enemyDistanceKm={enemyDistanceKm}
              simProgress={simProgress}
              tacticalSubStep={tacticalSubStep}
              fmcwInRange={fmcwInRange}
              c2Name={c2UnitForSim?.name ?? '지휘통제실'}
              enemy={primaryEnemyForSim ?? null}
              radarCharts={tacticalDashboardRadarCharts}
              onOpenDroneVideo={() => {
                if (!primaryEnemyForSim) return
                setMapVideoModal({
                  title: primaryEnemyForSim.codename,
                  subtitle: `적군 · ${primaryEnemyForSim.threatLevel} · ${primaryEnemyForSim.enemyBranch}`,
                  videoUrl: primaryEnemyForSim.droneVideoUrl || null,
                })
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
              enemy={tacticalSimPoints.enemy}
              enemyDistanceKm={enemyDistanceKm}
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
                    setMapVideoModal({
                      title: primaryEnemyForSim.codename,
                      subtitle: `적군 · ${primaryEnemyForSim.threatLevel} · ${primaryEnemyForSim.enemyBranch}`,
                      videoUrl: primaryEnemyForSim.droneVideoUrl || null,
                    })
                  }}
                >
                  드론 정찰 영상
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
              rangeKm={enemyDistanceKm}
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
                    setMapVideoModal({
                      title: primaryEnemyForSim.codename,
                      subtitle: `적군 · ${primaryEnemyForSim.threatLevel} · ${primaryEnemyForSim.enemyBranch}`,
                      videoUrl: primaryEnemyForSim.droneVideoUrl || null,
                    })
                  }}
                >
                  드론 정찰 영상
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
                enemyDistanceKm={enemyDistanceKm}
                simProgress={simProgress}
                tacticalSubStep={tacticalSubStep}
                fmcwInRange={fmcwInRange}
                c2Name={c2UnitForSim?.name ?? '지휘통제실'}
                enemy={primaryEnemyForSim ?? null}
                radarCharts={tacticalDashboardRadarCharts}
                onOpenDroneVideo={() => {
                  if (!primaryEnemyForSim) return
                  setMapVideoModal({
                    title: primaryEnemyForSim.codename,
                    subtitle: `적군 · ${primaryEnemyForSim.threatLevel} · ${primaryEnemyForSim.enemyBranch}`,
                    videoUrl: primaryEnemyForSim.droneVideoUrl || null,
                  })
                }}
              />
            )}
            {compareRightPane === 'schematic' && schematicBounds && tacticalSimPoints && (
              <TacticalSchematicMap
                bounds={schematicBounds}
                c2={tacticalSimPoints.c2}
                enemy={tacticalSimPoints.enemy}
                enemyDistanceKm={enemyDistanceKm}
                fmcwInRange={fmcwInRange}
                c2Name={c2UnitForSim?.name ?? '지휘통제실'}
                enemyName={primaryEnemyForSim?.codename ?? '우선 표적'}
              />
            )}
            {compareRightPane === 'canvasScope' && tacticalSimPoints && (
              <TacticalRadarCanvas
                bearingToEnemyDeg={tacticalSimPoints.bearing}
                rangeKm={enemyDistanceKm}
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
          <strong> 마우스를 올리면</strong> 핀 옆에 요약 정보가 뜨고, <strong>클릭하면</strong> 연결된 상황·정찰 영상을 큰 창에서 재생합니다. 상황 재생 시 궤적이 함께 갱신됩니다.
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
      <p className="muted">YOLO 검출·추적. 카메라: <NavLink to="/monitor">모니터</NavLink></p>

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

function DistanceAnalysisPage() {
  return (
    <section className="page">
      <h1>거리 분석</h1>
      <p className="muted">거리·경고·이력(연동 예정).</p>
      <div className="kpi-grid" style={{ marginTop: '1rem' }}>
        <article className="kpi-card neutral">
          <p className="kpi-label">객체별 거리</p>
          <strong className="kpi-value">추정 결과 표시 예정</strong>
        </article>
        <article className="kpi-card warning">
          <p className="kpi-label">위험 경고</p>
          <strong className="kpi-value">임계 거리 초과 시 알림</strong>
        </article>
        <article className="kpi-card safe">
          <p className="kpi-label">시간축 로그</p>
          <strong className="kpi-value">거리 변화 이력</strong>
        </article>
      </div>
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        SAR·센서 연동 시 이 페이지에 통합 예정.
      </p>
    </section>
  )
}

function GuidePage() {
  return (
    <section className="page">
      <h1>가이드</h1>
      <p className="muted">다층 감시: SAR → UAV → FMCW → 통합 상황판.</p>
      <ul style={{ lineHeight: 1.8, marginTop: '1rem' }}>
        <li>
          <strong>홈</strong> — 단계별 센서·통합 상황
        </li>
        <li>
          <strong>전차 식별/추적</strong> — YOLO·영상
        </li>
        <li>
          <strong>거리 분석</strong> — 거리·경고(확장 예정)
        </li>
        <li>
          <NavLink to="/sensor-pipeline">센서 파이프라인</NavLink> — 단계 요약
        </li>
        <li>
          <strong>위험지역</strong> — 지도·경로
        </li>
      </ul>
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        로그인 후 이용.
      </p>
    </section>
  )
}

const DEMO_DRONE_VIDEO_URL = '/media/yolo_tank_temp.mp4'

type SensorStepDef = {
  id: 'sat_sar' | 'uav_sar' | 'fmcw' | 'drone'
  title: string
  tag: string
  description: string
  technicalDetail: string
  scenarioDetail: string
  meta: { label: string; value: string }[]
}

/** 센서 파이프라인 개요 (홈 1~4단계와 동일 순서) */
const SENSOR_TECHNICAL_FLOW_OVERVIEW: string[] = [
  'SAR 광역 탐지·이상 징후.',
  'UAV 실시간 추적·EO/IR.',
  'FMCW·VoD 근거리 (live: /map/radar/snapshot?source=live).',
  '드론 EO/IR 식별·통합 상황 연동.',
]

const SENSOR_WEB_SCENARIO_OVERVIEW: string[] = [
  '1 SAR 광역·변화분석.',
  '2 UAV 추적.',
  '3 FMCW·VoD.',
  '4 통합 상황 — 40km/15km·드론 전환.',
]

const SENSOR_PIPELINE_STEPS: SensorStepDef[] = [
  {
    id: 'sat_sar',
    title: 'SAR 광역',
    tag: '광역 탐지',
    description: '광역 SAR로 이동·이상 징후 1차 탐지.',
    technicalDetail: 'Wide/변화분석 → 후보 AOI. (전술부대급 표적 범위.)',
    scenarioDetail: '홈 1단계: 전·후 비교 타일.',
    meta: [
      { label: '산출', value: 'AOI·변화 신호' },
      { label: '웹', value: 'SAR 타일·광역 지도' },
      { label: '다음', value: 'UAV·정밀' },
    ],
  },
  {
    id: 'uav_sar',
    title: 'UAV',
    tag: '추적 · EO/IR',
    description: 'UAV로 표적 실시간 추적·식별.',
    technicalDetail: 'YOLO/트래킹 등 연속 관측.',
    scenarioDetail: '홈 2단계 · 통합 상황 UAV 구간.',
    meta: [
      { label: '산출', value: '궤적·클래스' },
      { label: '웹', value: '부호·위치' },
      { label: '다음', value: '≤40km 전술 → FMCW' },
    ],
  },
  {
    id: 'fmcw',
    title: 'FMCW·VoD',
    tag: '≤15km',
    description: '근거리 레이더·VoD 융합.',
    technicalDetail: 'DBSCAN·연속 프레임. live: ?source=live.',
    scenarioDetail: '홈 3단계 · 통합 상황 부채꼴·탐지점.',
    meta: [
      { label: '산출', value: '탐지·트랙·예측' },
      { label: '웹', value: '차트·지도 오버레이' },
      { label: '다음', value: '드론 EO/IR' },
    ],
  },
  {
    id: 'drone',
    title: '드론 EO/IR',
    tag: '근접 식별',
    description: '임계 거리 내 EO/IR 확정.',
    technicalDetail: 'YOLO 등 영상 분류.',
    scenarioDetail: '통합 상황: 배너·핀 클릭 재생.',
    meta: [
      { label: '산출', value: '영상·식별' },
      { label: '웹', value: '모달·정찰 영상' },
      { label: '다음', value: '전술 추천' },
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

function SensorPipelinePage() {
  const [stepIndex, setStepIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)

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
            SAR → UAV → FMCW·VoD → 드론(EO/IR). 홈 1~4단계와 동일 흐름. 단계 선택 시 왼쪽 개요 강조.
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
              <span className="sensor-viewport-badge">
                {step.id === 'fmcw'
                  ? '실제 파이프라인 · /map/radar/snapshot?source=live (FMCW)'
                  : '개요 뷰'}
              </span>
            </div>

            {step.id === 'sat_sar' && (
              <div className="sensor-sar-plate sensor-sar-plate--sat" aria-hidden>
                <div className="sensor-sar-grid" />
                <div className="sensor-sar-hotspots">
                  <span style={{ top: '28%', left: '42%' }} />
                  <span style={{ top: '55%', left: '63%' }} />
                  <span style={{ top: '72%', left: '35%' }} />
                </div>
              </div>
            )}
            {step.id === 'uav_sar' && (
              <div className="sensor-sar-plate sensor-sar-plate--uav" aria-hidden>
                <div className="sensor-sar-grid sensor-sar-grid--fine" />
                <div className="sensor-sar-hotspots sensor-sar-hotspots--tight">
                  <span style={{ top: '44%', left: '48%' }} />
                  <span style={{ top: '51%', left: '54%' }} />
                </div>
              </div>
            )}
            {step.id === 'fmcw' && <SensorPipelineRadarLivePanel />}
            {step.id === 'drone' && (
              <div className="sensor-drone-wrap">
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

function HomeScenarioNavLink({
  step,
  label,
}: {
  step: '1' | '2' | '3' | '4'
  label: string
}) {
  const location = useLocation()
  const cur = new URLSearchParams(location.search).get('scenario')
  const active = location.pathname === '/' && (cur ?? '') === step
  return (
    <Link to={`/?scenario=${step}`} className={active ? 'active' : undefined}>
      {label}
    </Link>
  )
}

function AppLayout({ user, onLogout }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const onSimStarted = () => setSidebarCollapsed(true)
    window.addEventListener(SIM_STARTED_EVENT, onSimStarted)
    return () => window.removeEventListener(SIM_STARTED_EVENT, onSimStarted)
  }, [])

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <h2 className="brand">제어와드</h2>
        <nav className="sidebar-nav">
          <NavLink to="/sensor-pipeline">센서 파이프라인</NavLink>
          <HomeScenarioNavLink step="1" label="1. SAR 광역" />
          <HomeScenarioNavLink step="2" label="2. UAV" />
          <HomeScenarioNavLink step="3" label="3. FMCW" />
          <HomeScenarioNavLink step="4" label="4. 통합 상황" />
        </nav>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <div>
            <strong>지휘결심 지원 웹</strong>
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

function AuthLayout({ user }: { user: User | null }) {
  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-shell">
      <section className="page auth-page">
        <Outlet />
      </section>
    </div>
  )
}

function LoginPage({ onLoggedIn }: LoginPageProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        <button type="submit" className="btn-primary" disabled={isDisabled}>
          {isSubmitting ? '로그인 중...' : '로그인'}
        </button>
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

  useEffect(() => {
    if (!token) {
      return
    }

    void requestJson<User>(`${getApiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((result) => setUser(result))
      .catch(() => {
        localStorage.removeItem('accessToken')
        setUser(null)
        setToken(null)
      })
  }, [token])

  const handleAuthSuccess = (payload: AuthResponse) => {
    localStorage.setItem('accessToken', payload.accessToken)
    setToken(payload.accessToken)
    setUser(payload.user)
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    setToken(null)
    setUser(null)
  }

  return (
    <Routes>
      <Route element={<AppLayout user={user} onLogout={handleLogout} />}>
        <Route path="/" element={<HomePage user={user} />} />
        <Route path="/alert-zone" element={<AlertZonePage />} />
        <Route path="/identification" element={<IdentificationTrackingPage />} />
        <Route path="/monitor" element={<CameraMonitorPage />} />
        <Route path="/distance-analysis" element={<DistanceAnalysisPage />} />
        <Route path="/sensor-pipeline" element={<SensorPipelinePage />} />
        <Route path="/guide" element={<GuidePage />} />
      </Route>
      <Route element={<AuthLayout user={user} />}>
        <Route path="/login" element={<LoginPage onLoggedIn={handleAuthSuccess} />} />
        <Route path="/signup" element={<SignupPage onSignedUp={handleAuthSuccess} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
