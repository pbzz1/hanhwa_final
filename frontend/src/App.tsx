import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import { FmcwRadarScatter3D } from './FmcwRadarScatter3D'
import { RadarCharts2D } from './RadarCharts2D'
import { AirborneSarPage } from './AirborneSarPage'
import { FmcwRadarIntroPage } from './FmcwRadarIntroPage'
import { PulseRadarIntroPage } from './PulseRadarIntroPage'
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
  BATTALION_SCENARIO,
  isBattalionC2Unit,
  isEnemyNearDmz38,
  pickPrimaryEnemyForDistance,
  SCENARIO_RANGES_KM,
} from './scenarioBattalion'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3308'

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
  | 'pulse-dot'
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

/** 백엔드 /map/radar/snapshot — 펄스(광역·점) + FMCW(근거리·위상·예측 궤적) */
type RadarSnapshot = {
  pulse: {
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
    detections: Array<{ id: string; lat: number; lng: number }>
  }
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

/** 시뮬레이션 가짜 궤적 (키프레임 수) */
const SIM_PATH_STEPS = 200
/** 1배속일 때 재생에 걸리는 시간(초) */
const SIM_DURATION_SEC = 45
const SAR_UPDATE_INTERVAL_HOURS = 2
const SAR_WIDE_SCAN_PAUSE_PROGRESS = 0.12
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

/** 주 적 표적: 북→남 침공 단방향(합성 폴백) */
function buildLinearInvasionPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  seed: number,
): SimPoint[] {
  const out: SimPoint[] = []
  for (let i = 0; i <= SIM_PATH_STEPS; i += 1) {
    const t = i / SIM_PATH_STEPS
    const wobble = 0.01 * Math.sin(t * Math.PI * 5 + seed * 0.09)
    out.push({
      lat: fromLat + (toLat - fromLat) * t + wobble * Math.sin(seed * 0.07),
      lng: fromLng + (toLng - fromLng) * t + wobble * Math.cos(seed * 0.05),
    })
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
  enemies.forEach((e) => {
    if (primary && e.id === primary.id) {
      enemy.set(
        e.id,
        buildLinearInvasionPath(e.lat, e.lng, inv.lat, inv.lng, e.id * 23 + e.codename.length),
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

/** DEM 미연동 시 지도용 모의 표고(m) */
function syntheticElevationM(lat: number, lng: number, salt: number): number {
  const wobble =
    Math.sin(lat * 71.3 + salt * 0.09) * Math.cos(lng * 63.7 - salt * 0.05)
  return Math.round(95 + wobble * 220 + (Math.abs(salt) % 41) * 2)
}

function formatLatLngReadout(lat: number, lng: number): string {
  return `위도 ${lat.toFixed(5)}° · 경도 ${lng.toFixed(5)}°`
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
    <p class="ais-map-tooltip__row"><strong>좌표</strong> <span data-k="pos">—</span></p>
    <p class="ais-map-tooltip__row"><strong>표고</strong> <span data-k="elev">—</span></p>
    <p class="ais-map-tooltip__note muted">시뮬 궤적 기준 · 표고는 모의 지형</p>
  `
  const titleEl = infoContent.querySelector('.ais-map-tooltip__title')
  if (titleEl) titleEl.textContent = options.title

  const spdEl = infoContent.querySelector('[data-k="spd"]')
  const posEl = infoContent.querySelector('[data-k="pos"]')
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
      if (elevEl) elevEl.textContent = '—'
      return
    }
    const { lat, lng } = samplePath(path, pr)
    const spd = speedAlongPathKmH(path, pr)
    const elev = syntheticElevationM(lat, lng, elevSalt)
    if (spdEl) spdEl.textContent = spd != null ? `${spd.toFixed(1)} km/h` : '—'
    if (posEl) posEl.textContent = formatLatLngReadout(lat, lng)
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
    `${API_BASE_URL}/map/route/driving?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`

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

/** 주 적 표적: 남하 단방향 도로(실패 시 직선 보간) */
async function fetchRoadInvasionPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  seed: number,
): Promise<{ points: SimPoint[]; fromRoad: boolean }> {
  const routeUrl = `${API_BASE_URL}/map/route/driving?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`
  try {
    const leg = await requestJson<{ coordinates: SimPoint[] }>(routeUrl)
    const c = leg.coordinates
    if (!Array.isArray(c) || c.length < 2) {
      throw new Error('empty route')
    }
    return { points: resamplePolyline(c, SIM_PATH_STEPS), fromRoad: true }
  } catch {
    return {
      points: buildLinearInvasionPath(fromLat, fromLng, toLat, toLng, seed),
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

  units.forEach((u) => {
    friendly.set(u.id, buildFriendlyPath(u.lat, u.lng, u.id * 17 + u.name.length))
  })

  enemies.forEach((e) => {
    jobs.push(
      (async () => {
        if (primaryEnemy && e.id === primaryEnemy.id) {
          const { points, fromRoad } = await fetchRoadInvasionPath(
            e.lat,
            e.lng,
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
  c2UnitId?: number
  primaryEnemyId?: number
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

function rectBoundsCenter(b: ScenarioRectBounds): { lat: number; lng: number } {
  return {
    lat: (b.sw.lat + b.ne.lat) / 2,
    lng: (b.sw.lng + b.ne.lng) / 2,
  }
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
  /** 펄스 단계에서는 적을 점(단순 블립)으로만 표현 */
  enemyDotOnly?: boolean
  /** C2–적 거리(km); 펄스 불확실 구간에서 핀·원 표현 분기 */
  primaryEnemyDistanceKm?: number | null
  /** true일 때만 FMCW 섹터 내 락·탐지 콜백 처리 */
  fmcwRadarActive?: boolean
  /** SAR 접촉 후 C2 기준 ≤15km — 드론 출동·현장 촬영(데모) */
  droneFilmingActive?: boolean
  /** 통합 시뮬 5단계일 때만 드론 UI·핀 스타일 적용 */
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
        'enemy-pin--pulse-uncertain-only',
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
      const d = opts?.primaryEnemyDistanceKm
      if (dotOnly) {
        pinEl.classList.remove('enemy-pin--pulse-uncertain-only')
        circle.setMap(null)
      } else if (d != null) {
        const uncertain =
          d > SCENARIO_RANGES_KM.PULSE_UNCERTAIN_MIN && d <= SCENARIO_RANGES_KM.PULSE_MAX
        pinEl.classList.toggle('enemy-pin--pulse-uncertain-only', uncertain)
        if (uncertain) {
          circle.setMap(null)
        } else {
          circle.setMap(map)
        }
      } else {
        pinEl.classList.remove('enemy-pin--pulse-uncertain-only')
        circle.setMap(map)
      }
      pinEl.classList.toggle('enemy-pin--drone-filming', opts?.droneFilmingActive === true)
    } else {
      pinEl.classList.remove('enemy-pin--drone-filming')
      pinEl.classList.remove('enemy-pin--dot-only')
    }
  })

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
      const midLat = (a.lat + b.lat) / 2
      const midLng = (a.lng + b.lng) / 2
      distanceLabelOverlay.setPosition(new kakaoMaps.LatLng(midLat, midLng))
      const km = haversineKm(a, b)
      if (distanceLabelEl) {
        distanceLabelEl.textContent = `적–지휘통제실 ${km.toFixed(1)} km`
      }
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
  /** 통합 시뮬 지도: AIS형 호버(속도·좌표·표고) + 클릭 시 우측 재원 패널 연동 */
  enableTacticalAisUi?: boolean
  simPathsRef?: MutableRefObject<SimPathBundle | null>
  simProgressRef?: MutableRefObject<number>
  onSelectMapAssetRef?: MutableRefObject<(kind: 'friendly' | 'enemy', id: number) => void>
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
    onSelectMapAssetRef,
    enemyAssetHoverRef,
  } = ctx

  const tacticalAisUiEnabled =
    enableTacticalAisUi &&
    simPathsRefCtx != null &&
    simProgressRefCtx != null &&
    onSelectMapAssetRef != null

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
        '<div class="sar-overview-c2-dot" aria-hidden="true"></div><span class="sar-overview-c2-label">C2</span>'
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
        onSelect: () => onSelectMapAssetRef!.current?.('friendly', unit.id),
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
              `
          : `
                <span class="unit-badge unit-badge-friendly">아군</span>
                <h4 style="border-left-color:${markerColor};">
                  ${unit.level} · ${unit.name}
                </h4>
                <p><strong>전술 부호:</strong> ${TACTICAL_SYMBOL_LABEL[unit.symbolType]}</p>
                <p><strong>위치:</strong> ${LOCATION_STATUS_LABEL[unit.locationStatus]}${STRENGTH_LABEL[unit.strengthModifier] ? ` · ${STRENGTH_LABEL[unit.strengthModifier]}` : ''}</p>
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
          onSelectMapAssetRef!.current?.('enemy', enemy.id)
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
  const scenarioStep = useMemo((): 0 | 1 | 2 | 3 | 4 | 5 => {
    const q = searchParams.get('scenario')
    const n = q != null && q !== '' ? parseInt(q, 10) : NaN
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n as 0 | 1 | 2 | 3 | 4 | 5
    return 0
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
  const sceneRef = useRef<MapScene | null>(null)
  const insetSceneRef = useRef<MapScene | null>(null)
  const simProgressRef = useRef(0)
  const [friendlyUnits, setFriendlyUnits] = useState<FriendlyUnit[]>([])
  const [enemyInfiltrations, setEnemyInfiltrations] = useState<EnemyInfiltration[]>([])
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
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
  /** 통합 시뮬(5) 내부만: 3=펄스 대기, 4=펄스, 5=FMCW — 거리로 자동 전환 */
  const [tacticalSubStep, setTacticalSubStep] = useState<3 | 4 | 5>(3)
  /** 3~5단계 표현 — 카카오 지도·카드·SVG·Canvas·나란히 */
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
  const [mapSelectedAsset, setMapSelectedAsset] = useState<{
    kind: 'friendly' | 'enemy'
    id: number
  } | null>(null)
  const onSelectMapAssetRef = useRef<(kind: 'friendly' | 'enemy', id: number) => void>(() => {})
  onSelectMapAssetRef.current = (kind, id) => setMapSelectedAsset({ kind, id })
  const [uavLaunchStartProgress, setUavLaunchStartProgress] = useState<number | null>(null)
  const [droneLaunchStartProgress, setDroneLaunchStartProgress] = useState<number | null>(null)
  const [uavEnemyVideoExpanded, setUavEnemyVideoExpanded] = useState(false)
  const [tacticRecommendations, setTacticRecommendations] = useState<TacticRecommendation[]>([])
  const [tacticLoading, setTacticLoading] = useState(false)
  const [tacticSavePending, setTacticSavePending] = useState(false)
  const [tacticSaveMessage, setTacticSaveMessage] = useState<string | null>(null)
  const [selectedTacticUnit, setSelectedTacticUnit] = useState<string | null>(null)
  const [tacticDecisionNote, setTacticDecisionNote] = useState('')

  const c2UnitForSim = useMemo(
    () => friendlyUnits.find(isBattalionC2Unit) ?? null,
    [friendlyUnits],
  )
  const primaryEnemyForSim = useMemo(
    () => pickPrimaryEnemyForDistance(enemyInfiltrations),
    [enemyInfiltrations],
  )

  const enemyDistanceKm = useMemo(() => {
    if (scenarioStep !== 5 || !simPaths) return null
    return enemyDistanceFromC2Km(
      simPaths,
      simProgress,
      c2UnitForSim?.id ?? null,
      primaryEnemyForSim?.id ?? null,
    )
  }, [scenarioStep, simPaths, simProgress, c2UnitForSim?.id, primaryEnemyForSim?.id])

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
      return simProgress >= SAR_WIDE_SCAN_PAUSE_PROGRESS ? 'sat-wide-pause' : 'sat-watch'
    }
    if (uavTransitRatio < 1) return 'uav-transit'
    if (enemyDistanceKm == null || enemyDistanceKm > SCENARIO_RANGES_KM.PULSE_MAX) {
      return 'uav-track-only'
    }
    if (enemyDistanceKm > SCENARIO_RANGES_KM.FMCW_MAX) return 'pulse-dot'
    if (droneTransitRatio < 1) return 'fmcw-drone-transit'
    return 'tactics'
  }, [scenarioStep, uavLaunchStartProgress, uavTransitRatio, enemyDistanceKm, droneTransitRatio, simProgress])

  const enemyMapVisible =
    scenarioStep !== 5
      ? true
      : scenarioV2Phase === 'pulse-dot' ||
        scenarioV2Phase === 'fmcw-drone-transit' ||
        scenarioV2Phase === 'tactics'

  const enemyPulseDotOnly = scenarioStep === 5 && scenarioV2Phase === 'pulse-dot'

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

  const mapSelectedFriendly = useMemo(() => {
    if (!mapSelectedAsset || mapSelectedAsset.kind !== 'friendly') return null
    return friendlyUnits.find((u) => u.id === mapSelectedAsset.id) ?? null
  }, [mapSelectedAsset, friendlyUnits])

  const mapSelectedEnemy = useMemo(() => {
    if (!mapSelectedAsset || mapSelectedAsset.kind !== 'enemy') return null
    return enemyInfiltrations.find((e) => e.id === mapSelectedAsset.id) ?? null
  }, [mapSelectedAsset, enemyInfiltrations])

  const mapSelectedKinematics = useMemo(() => {
    if (!mapSelectedAsset || !simPaths) return null
    const path =
      mapSelectedAsset.kind === 'friendly'
        ? simPaths.friendly.get(mapSelectedAsset.id)
        : simPaths.enemy.get(mapSelectedAsset.id)
    if (!path?.length) return null
    const { lat, lng } = samplePath(path, simProgress)
    const spd = speedAlongPathKmH(path, simProgress)
    const elev = syntheticElevationM(lat, lng, mapSelectedAsset.id * 997)
    const brg = movementBearingAlongPath(path, simProgress)
    return { lat, lng, spd, elev, brg }
  }, [mapSelectedAsset, simPaths, simProgress])

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
    enemyDistanceKm <= SCENARIO_RANGES_KM.PULSE_MAX

  const pulseInRange =
    scenarioStep === 5 &&
    tacticalSubStep >= 4 &&
    sarContact &&
    radarSnapshot != null &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.PULSE_MAX

  const fmcwInRange =
    scenarioStep === 5 &&
    tacticalSubStep >= 5 &&
    sarContact &&
    radarSnapshot != null &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.FMCW_MAX

  const pulseUncertainBand =
    scenarioStep === 5 &&
    tacticalSubStep >= 4 &&
    pulseInRange &&
    enemyDistanceKm != null &&
    enemyDistanceKm > SCENARIO_RANGES_KM.PULSE_UNCERTAIN_MIN &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.PULSE_MAX

  /** C2 기준 ≤15km + SAR 접촉 — 정찰 드론 출동·EO/IR 촬영·전송(데모) */
  const droneDispatchActive =
    scenarioStep === 5 &&
    sarContact &&
    enemyDistanceKm != null &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM

  /** FMCW: ≤15km 부채꼴·상세 탐지·예측 경로 */
  const radarFmcwForMap = fmcwInRange ? radarSnapshot : null
  /** 펄스: ≤40km 광역 부채꼴·점 탐지 */
  const radarPulseForMap = pulseInRange ? radarSnapshot : null

  const insetMinimal =
    sarContact &&
    scenarioStep === 5 &&
    tacticalSubStep >= 4 &&
    enemyDistanceKm != null &&
    enemyDistanceKm > SCENARIO_RANGES_KM.PULSE_UNCERTAIN_MIN &&
    enemyDistanceKm <= SCENARIO_RANGES_KM.PULSE_MAX

  const mapUiActive =
    scenarioStep === 5 && (tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare')

  useEffect(() => {
    if (!mapUiActive) {
      mapCursorSetterRef.current(null)
      setMapSelectedAsset(null)
      clearEnemyAssetFloatTimer()
      setMapEnemyAssetHover(null)
    }
  }, [mapUiActive, clearEnemyAssetFloatTimer])

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
    if (simProgress >= SAR_WIDE_SCAN_PAUSE_PROGRESS && simPlaying) {
      setSimPlaying(false)
      return
    }
    if (simProgress < SAR_WIDE_SCAN_PAUSE_PROGRESS && !simPlaying) {
      setSimPlaying(true)
    }
  }, [scenarioStep, simPaths, uavLaunchStartProgress, simProgress, simPlaying])

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
      return
    }
    setTacticLoading(true)
    void requestJson<{ scenarioKey: string; recommendations: TacticRecommendation[] }>(
      `${API_BASE_URL}/map/tactics/recommendations?scenarioKey=battalion-reconstructed-v1`,
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
    enemyDotOnly: enemyPulseDotOnly,
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
  }

  useEffect(() => {
    if (scenarioStep !== 5 || enemyDistanceKm == null) return
    if (tacticalSubStep === 3 && enemyDistanceKm <= SCENARIO_RANGES_KM.PULSE_MAX) {
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

  /** 스냅샷 탐지들의 평균 range/az/el — 아래 고정 3D 산점도에 사용 */
  const radarDetectionsCentroid = useMemo(() => {
    if (!radarSnapshot?.fmcw.detections.length) return null
    const dets = radarSnapshot.fmcw.detections
    const n = dets.length
    let rangeM = 0
    let azimuthDeg = 0
    let elevationDeg = 0
    for (const d of dets) {
      rangeM += d.rangeM
      azimuthDeg += d.azimuthDeg
      elevationDeg += d.elevationDeg
    }
    return {
      rangeM: rangeM / n,
      azimuthDeg: azimuthDeg / n,
      elevationDeg: elevationDeg / n,
    }
  }, [radarSnapshot])

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
      requestJson<FriendlyUnitFromApi[]>(`${API_BASE_URL}/map/units`),
      requestJson<EnemyInfiltration[]>(`${API_BASE_URL}/map/infiltrations`),
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
    void requestJson<RadarSnapshot>(`${API_BASE_URL}/map/radar/snapshot?source=live`)
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
    if (scenarioStep !== 5) return
    const now = Math.max(simProgressRef.current, SAR_WIDE_SCAN_PAUSE_PROGRESS)
    simProgressRef.current = now
    setSimProgress(now)
    setUavLaunchStartProgress(now)
    setSimPlaying(true)
    setTacticSaveMessage(null)
  }, [scenarioStep])

  const handleSaveTacticDecision = useCallback(async () => {
    if (!selectedTacticUnit) return
    const picked = tacticRecommendations.find((r) => r.unitName === selectedTacticUnit)
    if (!picked) return
    setTacticSavePending(true)
    setTacticSaveMessage(null)
    try {
      await requestJson<{ ok: boolean; id: number; savedAt: string }>(
        `${API_BASE_URL}/map/tactics/decision`,
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
    setDroneLaunchStartProgress(null)
    setUavEnemyVideoExpanded(false)
    setSelectedTacticUnit(null)
    setTacticDecisionNote('')
    setTacticSaveMessage(null)
    setMapSelectedAsset(null)
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

  const simTimelineDisabled =
    !simPaths ||
    scenarioStep !== 5 ||
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
      return true
    })
  }, [simPaths, c2UnitForSim?.id, primaryEnemyForSim?.id])

  useEffect(() => {
    if (scenarioStep !== 5 || !mapUiActive) {
      return
    }
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY
    if (!mapContainerRef.current || !insetMapContainerRef.current || !appKey) {
      return
    }

    let alive = true

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
          onSelectMapAssetRef,
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

        const sarFrame = BATTALION_SCENARIO.overviewSarWatchBounds
        const sarRectPath = buildRectanglePolygonPath(kakaoMaps, sarFrame)
        const sarZonePoly = new kakaoMaps.Polygon({
          path: sarRectPath,
          strokeWeight: 4,
          strokeColor: '#d97706',
          strokeOpacity: 0.95,
          fillColor: '#fbbf24',
          fillOpacity: 0.14,
          zIndex: 0,
        })
        sarZonePoly.setMap(map)
        radarDisposables.push(sarZonePoly)
        const sarZoneCenter = rectBoundsCenter(sarFrame)
        const sarZoneLbl = document.createElement('div')
        sarZoneLbl.className = 'map-overview-region-label map-overview-region-label--sar'
        sarZoneLbl.innerHTML =
          '<span class="map-overview-region-label__title">위성 SAR 초점 감시</span>' +
          '<span class="map-overview-region-label__sub">적 집결·출발 지점 소구역</span>'
        const sarZoneOv = new kakaoMaps.CustomOverlay({
          map,
          position: new kakaoMaps.LatLng(sarZoneCenter.lat, sarZoneCenter.lng),
          yAnchor: 0.5,
          xAnchor: 0.5,
          content: sarZoneLbl,
          zIndex: 11,
        })
        radarDisposables.push(sarZoneOv)

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
        routeZonePoly.setMap(map)
        radarDisposables.push(routeZonePoly)
        const routeZoneCenter = rectBoundsCenter(routeFrame)
        const routeZoneLbl = document.createElement('div')
        routeZoneLbl.className =
          'map-overview-region-label map-overview-region-label--route'
        routeZoneLbl.innerHTML =
          '<span class="map-overview-region-label__title">남하 침투 예상 경로 권역</span>' +
          '<span class="map-overview-region-label__sub">집결지 → 침투 목표 축 (도로 시뮬)</span>'
        const routeZoneOv = new kakaoMaps.CustomOverlay({
          map,
          position: new kakaoMaps.LatLng(routeZoneCenter.lat, routeZoneCenter.lng),
          yAnchor: 0.5,
          xAnchor: 0.5,
          content: routeZoneLbl,
          zIndex: 11,
        })
        radarDisposables.push(routeZoneOv)

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
          sarCircle.setMap(map)
          radarDisposables.push(sarCircle)
          const sarLbl = document.createElement('div')
          sarLbl.className = 'sar-tank-loss-label'
          sarLbl.textContent = z.label
          const sarLblOv = new kakaoMaps.CustomOverlay({
            map,
            position: zCenter,
            yAnchor: 0,
            xAnchor: 0.5,
            content: sarLbl,
            zIndex: 12,
          })
          radarDisposables.push(sarLblOv)
        }

        if (radarPulseForMap) {
          const P = radarPulseForMap.pulse.radar
          const pulsePts = buildRadarSectorPath(
            P.lat,
            P.lng,
            P.rangeMaxM,
            P.headingDeg,
            P.fovDeg,
          )
          const pulsePath = pulsePts.map((p) => new kakaoMaps.LatLng(p.lat, p.lng))
          const pulsePoly = new kakaoMaps.Polygon({
            path: pulsePath,
            strokeWeight: 1,
            strokeColor: '#a78bfa',
            strokeOpacity: 0.28,
            fillColor: '#c4b5fd',
            fillOpacity: 0.04,
            zIndex: 1,
          })
          pulsePoly.setMap(map)
          radarDisposables.push(pulsePoly)

          radarPulseForMap.pulse.detections.forEach((det) => {
            const detPos = new kakaoMaps.LatLng(det.lat, det.lng)
            const dot = document.createElement('div')
            dot.className = 'radar-pulse-dot'
            dot.setAttribute('aria-label', `펄스 탐지 ${det.id}`)

            const dotOv = new kakaoMaps.CustomOverlay({
              map,
              position: detPos,
              yAnchor: 0.5,
              xAnchor: 0.5,
              content: dot,
              zIndex: 5,
            })
            radarDisposables.push(dotOv)
          })
        }

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

            const midF = futureTrajOk[Math.floor(futureTrajOk.length / 2)]!
            const midFutLl = new kakaoMaps.LatLng(midF.lat, midF.lng)
            const futLbl = document.createElement('div')
            futLbl.className = 'radar-fmcw-future-track-label'
            futLbl.innerHTML = `
              <span class="radar-fmcw-future-track-label__title">속도 외삽 궤적</span>
              <span class="radar-fmcw-future-track-label__row">연속 레이더 프레임 → 1위 후보 미래 경로 (별도 레이어)</span>
            `
            const futOv = new kakaoMaps.CustomOverlay({
              map,
              position: midFutLl,
              yAnchor: 1,
              xAnchor: 0.5,
              content: futLbl,
              zIndex: 9,
            })
            radarDisposables.push(futOv)
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

            const mid = track.predictedPath[Math.floor(track.predictedPath.length / 2)]!
            const midLl = new kakaoMaps.LatLng(mid.lat, mid.lng)
            const trackLbl = document.createElement('div')
            trackLbl.className = 'radar-fmcw-track-label'
            trackLbl.innerHTML = `
              <span class="radar-fmcw-track-label__title">FMCW 예측 (VoD·도플러 외삽)</span>
              <span class="radar-fmcw-track-label__row">진행 방위 <strong>${track.bearingDeg}°</strong> · 위상 보조 <strong>${track.phaseRefDeg}°</strong></span>
            `
            const trackOv = new kakaoMaps.CustomOverlay({
              map,
              position: midLl,
              yAnchor: 1,
              xAnchor: 0.5,
              content: trackLbl,
              zIndex: 8,
            })
            radarDisposables.push(trackOv)
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
        sceneRef.current = {
          kakaoMaps,
          map,
          units: mainPins.units,
          enemies: mainPins.enemies,
          radarDisposables:
            radarDisposables.length > 0 ? radarDisposables : undefined,
        }

        const insetPins = attachKakaoTacticalPins({
          ...pinCtxBase,
          map: insetMap,
          enableRadarHoverPanel: false,
          insetMinimal,
        })

        const c2Unit = friendlyUnits.find(isBattalionC2Unit)
        const primaryEnemy = pickPrimaryEnemyForDistance(enemyInfiltrations)
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
      })
    }

    if (existingScript && (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps) {
      onLoadKakaoMap()
      return () => {
        alive = false
        mapCursorSetterRef.current(null)
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
      mapCursorSetterRef.current(null)
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
    radarPulseForMap,
    radarFmcwForMap,
    insetMinimal,
    tacticalPhaseUi,
    mapUiActive,
  ])

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
            <strong>0단계</strong>에서 센서 흐름을 요약하고, <strong>1~4단계</strong>에서 항공 SAR → UAV → 펄스 → FMCW의{' '}
            <strong>모델·입력·출력</strong>을 페이지별로 봅니다. <strong>통합 시뮬</strong>에서는 대대 지도에서 거리에
            따라 펄스·FMCW가 연동됩니다.
          </>
        ) : scenarioStep === 1 ? (
          <>
            <strong>1단계</strong>: 항공(위성) SAR 변화분석 — 광역 타일 전·후 비교로 이상 구역을 확인합니다.
          </>
        ) : scenarioStep === 2 ? (
          <>
            <strong>2단계</strong>: UAV SAR·EO — 저고도에서 표적을 정밀 추적하는 개념과 입·출력을 정리합니다.
          </>
        ) : scenarioStep === 3 ? (
          <>
            <strong>3단계</strong>: 펄스 레이더 — 광역 점 탐지 개념과 모의 PPI 시각화입니다.
          </>
        ) : scenarioStep === 4 ? (
          <>
            <strong>4단계</strong>: FMCW·VoD — live 스냅샷으로 카메라·부가 설명을 보고, 통합 시뮬에서 점 추정·이동
            방향을 적용합니다.
          </>
        ) : (
          <>
            <strong>통합 시뮬</strong> — 4단계의 <strong>레이더·영상 융합</strong>을 지도에 적용해 표적을{' '}
            <strong>점</strong>으로 추정하고, <strong>현재 위치·C2 기준 방위·이동 방향</strong>을 표시합니다.{' '}
            {BATTALION_SCENARIO.subtitle} <strong>지휘통제실</strong> 기준 거리에 따라 펄스(40km)·FMCW(15km)가
            전환됩니다.
          </>
        )}
      </p>
      {user ? (
        <>
          <p>
            현재 로그인: <strong>{user.email}</strong>
          </p>
          <p>
            아군은 소대/중대/대대로 구분되어 표시되며, 적측은 <strong>기갑·포병 등 전술 표적</strong>만을 반경과 함께
            강조합니다. 적 마커에 마우스를 올리면 드론 정찰 영상을 확인할 수 있습니다.
          </p>
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

      {scenarioStep === 3 && <PulseRadarIntroPage onContinue={() => setScenarioStep(4)} />}

      {scenarioStep === 4 && (
        <FmcwRadarIntroPage
          onContinue={() => {
            setTacticalSubStep(3)
            setScenarioStep(5)
          }}
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
          통합 시뮬레이션 · 대대 전술 상황도
          {tacticalSubStep === 3
            ? ' · 펄스 대기(40km 권역 밖/미진입)'
            : tacticalSubStep === 4
              ? ' · 펄스 레이더(≤40km)'
              : ' · FMCW(≤15km)'}
        </h2>
        <div className="scenario-theory-apply-panel" role="region" aria-label="4단계 이론을 통합 시뮬에 적용">
          <h3 className="scenario-theory-apply-panel__title">4단계 이론 적용 · 표적 추정과 이동</h3>
          <p className="scenario-theory-apply-panel__lead muted">
            <strong>VoD·FMCW에서 본 range·azimuth·도플러</strong>를 이 지도에 올리면, 광역에서는 반사체를{' '}
            <strong>점(펄스 탐지)</strong>으로, 근거리에서는 <strong>색점·예측 궤적(FMCW)</strong>으로 표적 위치를
            추정합니다. 아래 수치는 시뮬 시점의 <strong>지휘통제실→표적 방위</strong>와 궤적상{' '}
            <strong>이동 방향</strong>입니다.
          </p>
          <ul className="scenario-theory-apply-panel__bullets muted">
            <li>
              <strong>펄스(≤40km)</strong>: 레이더 시야 안 다수 점 → 지도에 보라 부채꼴·탐지 점으로 투영(데모).
            </li>
            <li>
              <strong>FMCW(≤15km)</strong>: 정밀 탐지 점·도플러 색·주황 <strong>예측 경로</strong>·트랙 방위 라벨.
            </li>
          </ul>
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
                    '시뮬 재생 후 표시'
                  )}
                </dd>
              </div>
              {radarSnapshot && pulseInRange ? (
                <div>
                  <dt>펄스 탐지 점(스냅샷)</dt>
                  <dd>
                    <strong>{radarSnapshot.pulse.detections.length}</strong>개
                  </dd>
                </div>
              ) : null}
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
          시뮬레이션은 <strong>도로·합성 궤적</strong>으로 표적 이동을 보여 줍니다. 적은 <strong>38선 이북</strong>에서
          남하하며, <strong>40km 이내</strong>에서 펄스, <strong>15km 이내</strong>에서 FMCW가 활성화됩니다. SAR 접촉
          후 표적이 지휘통제실 기준 <strong>{SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM}km 이내</strong>로 들어오면{' '}
          <strong>정찰 드론이 출동해 현장 EO/IR 영상을 촬영·전송</strong>하는 설정(데모)입니다.{' '}
          <strong>1~4단계</strong>에서 각 센서를 소개한 뒤 이 화면에서 연동을 확인합니다. 표현은 아래{' '}
          <strong>지도 · 카드 · SVG · Canvas · 나란히</strong>에서 바꿀 수 있습니다.
        </p>
        <section className="scenario-v2-panel" aria-label="재구성 시나리오 진행">
          <div className="scenario-v2-panel__head">
            <h3>재구성 시나리오</h3>
            <span className="scenario-v2-panel__clock">
              시나리오 경과 {Math.round(simProgress * 50)}분 · 위성 SAR 갱신 {SAR_UPDATE_INTERVAL_HOURS}시간/회
            </span>
          </div>
          <p className="muted scenario-v2-panel__desc">
            초기에는 적 위치를 숨기고 SAR 이상징후(전차 15대 이상 소실) 이후 UAV 출정을 승인합니다. UAV 단계에서는
            분류(전차/일반차량)와 객체 연속성만 유지하며, 40km에서 펄스 점표시, 15~10km 구간부터 FMCW·드론·YOLO를
            결합합니다.
          </p>
          <div className="scenario-v2-panel__status">
            <strong>현재 단계:</strong>{' '}
            {scenarioV2Phase === 'sat-watch'
              ? '위성 SAR 1차 감시'
              : scenarioV2Phase === 'sat-wide-pause'
                ? '위성 SAR 2차 광역 탐지 · UAV 출정 대기(일시정지)'
                : scenarioV2Phase === 'uav-transit'
                  ? 'UAV 군사분계선 이동(5분 할당)'
                  : scenarioV2Phase === 'uav-track-only'
                    ? 'UAV 추적(적 약 250km 권역 · 위치 비공개)'
                    : scenarioV2Phase === 'pulse-dot'
                      ? '펄스 레이더 40km 점탐지'
                      : scenarioV2Phase === 'fmcw-drone-transit'
                        ? 'FMCW 단계 · 드론 전장 이동(5분)'
                        : '전술 선택 지원 단계'}
          </div>
          <div className="scenario-v2-panel__metrics">
            <span>가정 적 거리: 약 {narrativeEnemyDistanceKm.toFixed(1)} km</span>
            {uavLaunchStartProgress != null && (
              <span>UAV 이동률 {Math.round(uavTransitRatio * 100)}%</span>
            )}
            {droneLaunchStartProgress != null && (
              <span>드론 이동률 {Math.round(droneTransitRatio * 100)}%</span>
            )}
          </div>
          {scenarioHoldForUav && (
            <div className="scenario-v2-panel__action">
              <button type="button" className="btn-primary" onClick={handleLaunchUavFromBattalion}>
                UAV 출정 (대대 → 군사분계선)
              </button>
            </div>
          )}
        </section>
        <div className="sim-toolbar">
          <button
            type="button"
            className="btn-primary"
            disabled={simTimelineDisabled}
            onClick={handleSimTogglePlay}
          >
            {simPlaying ? '일시정지' : '시뮬레이션 재생'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={simTimelineDisabled}
            onClick={handleSimReset}
          >
            처음으로
          </button>
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
            aria-label="시뮬레이션 타임라인"
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
            {formatSimClock(simProgress, SIM_DURATION_SEC)} / {formatSimClock(1, SIM_DURATION_SEC)} (
            {Math.round(simProgress * 100)}%) · 막대 클릭·드래그로 시점 이동 ·{' '}
            <span className="sim-progress-label__kbd">←→</span> <span className="sim-progress-label__kbd">
              Home
            </span>
            /
            <span className="sim-progress-label__kbd">End</span> · 1× 기준 약 {SIM_DURATION_SEC}초 데모
          </span>
          <div className="tactical-ui-mode" role="group" aria-label="통합 시뮬 표현 방식">
            <span className="tactical-ui-mode__label muted">통합 시뮬</span>
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
        {roadPathStatus === 'loading' && (
          <p className="muted road-path-hint">
            <strong>도로 궤적</strong> 계산 중(OSRM driving, 백엔드 프록시)… 잠시 후 핀이 실제 도로망을
            따릅니다.
          </p>
        )}
        {roadPathStatus === 'all-road' && (
          <p className="muted road-path-hint">
            시뮬레이션: 주 적 표적은 <strong>남하 침공 단방향</strong>, 아군은 <strong>초기 위치 고정</strong>입니다.
          </p>
        )}
        {roadPathStatus === 'partial' && (
          <p className="muted road-path-hint">
            일부 객체만 도로 궤적 적용, 나머지는 <strong>합성 궤적</strong>(OSRM 실패 구간).
          </p>
        )}
        {roadPathStatus === 'synthetic' &&
          (friendlyUnits.length > 0 || enemyInfiltrations.length > 0) && (
          <p className="muted road-path-hint">
            도로 API를 쓰지 못해 <strong>합성 곡선</strong>만 사용 중입니다. 백엔드 실행 및 네트워크를
            확인하세요.
          </p>
        )}
        {mapLoading && (tacticalPhaseUi === 'map' || tacticalPhaseUi === 'compare') && (
          <p className="muted">지도 데이터 로딩 중...</p>
        )}

        {scenarioStep === 5 &&
          enemyDistanceKm != null &&
          enemyDistanceKm > SCENARIO_RANGES_KM.PULSE_MAX && (
          <div className="scenario-standby-banner" role="status">
            <span className="scenario-standby-banner__badge">대기</span>
            <span>
              적이 아직 <strong>40km 권역 밖</strong>입니다. 시뮬을 재생하면 남하하며, <strong>40km 이내</strong>로
              들어오면 <strong>펄스 레이더</strong> 부채꼴·탐지 점이 켜집니다. (UAV 광역 추적은{' '}
              <strong>2단계</strong>에서 확인하세요.)
            </span>
          </div>
        )}
        {scenarioStep === 5 && sarContact && pulseUncertainBand && (
          <div className="scenario-pulse-uncertain-banner" role="alert">
            <span className="scenario-pulse-uncertain-banner__badge">펄스</span>
            <span>
              <strong>미확인 물체 확인</strong> — 지휘통제실 기준 약 15~40km 구간입니다.{' '}
              {tacticalPhaseUi === 'map' ? (
                <>
                  지도에는 <strong>점 탐지</strong>만 표시하고, 우하단 <strong>전술 확대</strong> 창에서{' '}
                  <strong>레이더 스윕</strong>이 동작합니다.
                </>
              ) : tacticalPhaseUi === 'compare' ? (
                <>
                  왼쪽 지도는 위와 동일하고, 오른쪽 패널(SVG·Canvas·카드)에서는 <strong>스캔·거리·도식</strong>으로 같은
                  구간을 단순화해 보여 줍니다.
                </>
              ) : (
                <>
                  카드·SVG·Canvas 모드에서는 <strong>스캔 면·거리 링·도식</strong>으로만 표현합니다(타일 지도 없음).
                </>
              )}
            </span>
          </div>
        )}
        {droneDispatchActive && (
          <div className="scenario-drone-banner" role="status">
            <span className="scenario-drone-banner__badge">드론</span>
            <span>
              <strong>정찰 드론 출동</strong> — 표적이 지휘통제실 기준{' '}
              <strong>{SCENARIO_RANGES_KM.DRONE_DISPATCH_MAX_KM}km 이내</strong>로 접근해{' '}
              <strong>현장 EO/IR 영상 촬영·전송</strong>이 가동 중입니다. (데모: 적 표적 핀을 클릭하면 재생)
            </span>
          </div>
        )}
        {enemyRadarDiscovered && scenarioStep === 5 && tacticalSubStep >= 5 && (
          <div className="scenario-discover-alert" role="alert">
            <span className="scenario-discover-alert__badge">FMCW</span>
            <span>
              <strong>FMCW 접촉</strong> — 15km 이내에서 대상 분류·방위·주시 정보가 활성화되었습니다. 적 핀을{' '}
              <strong>클릭</strong>하면 드론 정찰 영상을 재생할 수 있습니다.
            </span>
          </div>
        )}
        {enemyNearDmz38 && (
          <div className="scenario-dmz-alert" role="status">
            <span className="scenario-dmz-alert__badge">38선</span>
            <span>
              <strong>적 접근</strong> — 표적이 북위 38° 부근(휴전선 인접 권역)으로 내려오고 있습니다. 지도에
              주황 점선 표시.
            </span>
          </div>
        )}
        {scenarioStep === 5 && fmcwInRange && (
          <div className="scenario-red-alert" role="alert">
            <span className="scenario-red-alert__badge">FMCW</span>
            <span>
              <strong>FMCW 정밀 탐지</strong> — 이동 방향·레이더 주시축·예측 궤적이{' '}
              {tacticalPhaseUi === 'map' ? (
                <>지도에 표시됩니다. 드론 영상은 적 표적 <strong>클릭</strong>으로 확인하세요.</>
              ) : tacticalPhaseUi === 'compare' ? (
                <>
                  지도·오른쪽 패널에 표시됩니다. 드론은 지도 <strong>클릭</strong> 또는 카드 모드의 <strong>버튼</strong>
                  (오른쪽이 카드일 때)로 재생하세요.
                </>
              ) : tacticalPhaseUi === 'dashboard' ? (
                <>아래 차트와 수치로 표시됩니다. 드론 영상은 <strong>버튼</strong>으로 재생하세요.</>
              ) : (
                <>
                  아래 공통 FMCW 패널·차트를 참고하세요. 드론은 카드 모드로 전환 후 <strong>버튼</strong>으로 재생할 수
                  있습니다.
                </>
              )}
            </span>
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
            <h3 className="map-subtitle">SAR 광역 현황 (전차 신호 소실 구역)</h3>
            <p className="muted map-subtitle-hint">
              붉은 원은 <strong>SAR 변화분석</strong> 의심 구역입니다. 아군은 <strong>대대 지휘통제실(C2)</strong> 위치만
              노란 점으로 표시합니다.{' '}
              {showTacticalPip ? (
                <span className="map-pip-hint">
                  적이 40km 권역에 진입했습니다 — 우측 하단 <strong>전술 확대</strong> 창에서 C2·표적 축을 크게
                  봅니다.
                </span>
              ) : (
                <span>
                  적이 지휘통제실 기준 <strong>40km 이내</strong>로 들어오면 전술 대치 지도가 이 화면 안에{' '}
                  <strong>작은 확대 창</strong>으로 나타납니다.
                </span>
              )}
            </p>
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
                <div ref={mapContainerRef} className="maplibre-container map-main-overview" />
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
                    {pulseInRange && showTacticalPip && (
                      <div className="radar-sweep-overlay" aria-hidden />
                    )}
                  </div>
                </div>
                {(scenarioV2Phase === 'uav-track-only' ||
                  scenarioV2Phase === 'pulse-dot' ||
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
                    <strong>UAV-01</strong> 대대→군사분계선 이동 {Math.round(uavTransitRatio * 100)}%
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
            aria-label="FMCW 레이더 표적 3D 산점도"
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
              VoD 스타일로 range·azimuth·elevation을 묶은 <strong>3D 포인트 클라우드(모의)</strong>입니다. 축:
              빨강=동(x), 초록=북(y), 파랑=상(z).
            </p>
            <FmcwRadarScatter3D
              rangeM={radarHoverMetrics.rangeM}
              azimuthDeg={radarHoverMetrics.azimuthDeg}
              elevationDeg={radarHoverMetrics.elevationDeg}
              className="radar-enemy-hover-panel__canvas"
            />
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
                  <dt>좌표</dt>
                  <dd>
                    {formatLatLngReadout(mapEnemyHoverKinematics.lat, mapEnemyHoverKinematics.lng)}
                  </dd>
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
                      ? formatLatLngReadout(mapCursorLatLng.lat, mapCursorLatLng.lng)
                      : '지도 위에 마우스를 올리면 위·경도가 표시됩니다.'}
                  </span>
                </footer>
              </div>

              {!uavEnemyVideoExpanded && (
              <aside className="map-ais-asset-panel" aria-labelledby="map-ais-panel-title">
                <div className="map-ais-asset-panel__head">
                  <h4 id="map-ais-panel-title" className="map-ais-asset-panel__title">
                    표적 재원
                  </h4>
                  <button
                    type="button"
                    className="btn-secondary map-ais-asset-panel__clear"
                    onClick={() => setMapSelectedAsset(null)}
                  >
                    선택 해제
                  </button>
                </div>

                {!mapSelectedAsset && (
                  <p className="muted map-ais-asset-panel__empty">
                    아군·적 <strong>핀을 클릭</strong>하면 식별·전력 정보가 여기 고정 표시됩니다.{' '}
                    <strong>적 표적이 지도에 보이는 구간</strong>에서는 적 핀에 마우스를 올리면 같은 재원 정보가 지도
                    위 <strong>플로팅 패널</strong>로 뜹니다.
                  </p>
                )}

                {mapSelectedFriendly && (
                  <div className="map-ais-asset-panel__body">
                    <p className="map-ais-asset-panel__side map-ais-asset-panel__side--friendly">아군</p>
                    <h5 className="map-ais-asset-panel__name">
                      {mapSelectedFriendly.level} · {mapSelectedFriendly.name}
                    </h5>
                    {mapSelectedKinematics && (
                      <dl className="map-ais-asset-panel__kinematics">
                        <div>
                          <dt>이동속도</dt>
                          <dd>
                            {mapSelectedKinematics.spd != null
                              ? `${mapSelectedKinematics.spd.toFixed(1)} km/h`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>좌표</dt>
                          <dd>{formatLatLngReadout(mapSelectedKinematics.lat, mapSelectedKinematics.lng)}</dd>
                        </div>
                        <div>
                          <dt>표고</dt>
                          <dd>{mapSelectedKinematics.elev} m</dd>
                        </div>
                        {mapSelectedKinematics.brg != null && (
                          <div>
                            <dt>이동 방위</dt>
                            <dd>
                              {mapSelectedKinematics.brg.toFixed(0)}° ({bearingToCardinalKo(mapSelectedKinematics.brg)})
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <dl className="map-ais-asset-panel__specs">
                      <div>
                        <dt>전술 부호</dt>
                        <dd>{TACTICAL_SYMBOL_LABEL[mapSelectedFriendly.symbolType]}</dd>
                      </div>
                      <div>
                        <dt>위치 상태</dt>
                        <dd>
                          {LOCATION_STATUS_LABEL[mapSelectedFriendly.locationStatus]}
                          {STRENGTH_LABEL[mapSelectedFriendly.strengthModifier]
                            ? ` · ${STRENGTH_LABEL[mapSelectedFriendly.strengthModifier]}`
                            : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>병과</dt>
                        <dd>{mapSelectedFriendly.branch}</dd>
                      </div>
                      <div>
                        <dt>병력</dt>
                        <dd>{mapSelectedFriendly.personnel}명</dd>
                      </div>
                      <div>
                        <dt>장비</dt>
                        <dd>{mapSelectedFriendly.equipment}</dd>
                      </div>
                      <div>
                        <dt>준비태세</dt>
                        <dd>{mapSelectedFriendly.readiness}</dd>
                      </div>
                      <div>
                        <dt>임무</dt>
                        <dd>{mapSelectedFriendly.mission}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="btn-primary map-ais-asset-panel__video"
                      onClick={() =>
                        setMapVideoModal({
                          title: mapSelectedFriendly.name,
                          subtitle: `아군 · ${mapSelectedFriendly.level} · ${mapSelectedFriendly.branch}`,
                          videoUrl: mapSelectedFriendly.situationVideoUrl,
                        })
                      }
                    >
                      상황·정찰 영상
                    </button>
                  </div>
                )}

                {mapSelectedEnemy && (
                  <div className="map-ais-asset-panel__body">
                    <p className="map-ais-asset-panel__side map-ais-asset-panel__side--enemy">적</p>
                    <h5 className="map-ais-asset-panel__name">{mapSelectedEnemy.codename}</h5>
                    {mapSelectedKinematics && (
                      <dl className="map-ais-asset-panel__kinematics">
                        <div>
                          <dt>이동속도</dt>
                          <dd>
                            {mapSelectedKinematics.spd != null
                              ? `${mapSelectedKinematics.spd.toFixed(1)} km/h`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>좌표</dt>
                          <dd>{formatLatLngReadout(mapSelectedKinematics.lat, mapSelectedKinematics.lng)}</dd>
                        </div>
                        <div>
                          <dt>표고</dt>
                          <dd>{mapSelectedKinematics.elev} m</dd>
                        </div>
                        {mapSelectedKinematics.brg != null && (
                          <div>
                            <dt>이동 방위</dt>
                            <dd>
                              {mapSelectedKinematics.brg.toFixed(0)}° ({bearingToCardinalKo(mapSelectedKinematics.brg)})
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <dl className="map-ais-asset-panel__specs">
                      <div>
                        <dt>병과</dt>
                        <dd>{mapSelectedEnemy.enemyBranch}</dd>
                      </div>
                      <div>
                        <dt>위협</dt>
                        <dd>{mapSelectedEnemy.threatLevel}</dd>
                      </div>
                      <div>
                        <dt>추정 인원</dt>
                        <dd>{mapSelectedEnemy.estimatedCount}명</dd>
                      </div>
                      <div>
                        <dt>관측 시각</dt>
                        <dd>{mapSelectedEnemy.observedAt}</dd>
                      </div>
                      <div>
                        <dt>위험 반경</dt>
                        <dd>{mapSelectedEnemy.riskRadiusMeter.toLocaleString('ko-KR')} m</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="btn-primary map-ais-asset-panel__video"
                      onClick={() =>
                        setMapVideoModal({
                          title: mapSelectedEnemy.codename,
                          subtitle: `적군 · ${mapSelectedEnemy.threatLevel} · ${mapSelectedEnemy.enemyBranch}`,
                          videoUrl: mapSelectedEnemy.droneVideoUrl || null,
                        })
                      }
                    >
                      드론 정찰 영상
                    </button>
                  </div>
                )}
              </aside>
              )}
            </div>
          </div>
        </div>
        </div>
        )}

        {tacticalPhaseUi === 'dashboard' && (
          <div className="tactical-phase-pane tactical-phase-pane--dashboard">
            <h3 className="map-subtitle">카드형 대시보드 (타일 지도 없음)</h3>
            <p className="muted map-subtitle-hint">
              거리 게이지·스캔 원·FMCW 차트만 모은 UI입니다. 카카오맵의 핀·SAR·다중 레이어 없이 같은 시뮬 값만
              봅니다.
            </p>
            <TacticalPhaseDashboard
              enemyDistanceKm={enemyDistanceKm}
              simProgress={simProgress}
              tacticalSubStep={tacticalSubStep}
              pulseInRange={pulseInRange}
              pulseUncertainBand={pulseUncertainBand}
              fmcwInRange={fmcwInRange}
              c2Name={c2UnitForSim?.name ?? '지휘통제실'}
              enemy={primaryEnemyForSim ?? null}
              radarCharts={tacticalDashboardRadarCharts}
              radarCentroid={radarDetectionsCentroid}
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
              위·경도만 직교 투영한 선화면입니다. 38선·C2·적·거리선·펄스/FMCW 부채꼴만 남기고 위성 타일·부대 핀·SAR
              원은 제거했습니다.
            </p>
            <TacticalSchematicMap
              bounds={schematicBounds}
              c2={tacticalSimPoints.c2}
              enemy={tacticalSimPoints.enemy}
              enemyDistanceKm={enemyDistanceKm}
              pulseInRange={pulseInRange}
              pulseUncertainBand={pulseUncertainBand}
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
              pulseInRange={pulseInRange}
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
                pulseInRange={pulseInRange}
                pulseUncertainBand={pulseUncertainBand}
                fmcwInRange={fmcwInRange}
                c2Name={c2UnitForSim?.name ?? '지휘통제실'}
                enemy={primaryEnemyForSim ?? null}
                radarCharts={tacticalDashboardRadarCharts}
                radarCentroid={radarDetectionsCentroid}
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
                pulseInRange={pulseInRange}
                pulseUncertainBand={pulseUncertainBand}
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
                pulseInRange={pulseInRange}
                fmcwInRange={fmcwInRange}
                radarHeadingDeg={radarCanvasConfig.headingDeg}
                radarFovDeg={radarCanvasConfig.fovDeg}
              />
            )}
          </div>
        )}
        </div>

        {scenarioV2Phase === 'tactics' && (
          <section className="tactic-decision-panel" aria-label="전술 선택 지원">
            <h3 className="tactic-decision-panel__title">전술 선택 지원 (적합도 추천)</h3>
            <p className="muted tactic-decision-panel__desc">
              부대별 적합도를 참고해 선택하면 DB에 저장됩니다. (예: 부대1 60% 적합)
            </p>
            {tacticLoading ? (
              <p className="muted">전술 추천 데이터를 불러오는 중...</p>
            ) : tacticRecommendations.length === 0 ? (
              <p className="muted">추천 데이터가 없습니다.</p>
            ) : (
              <div className="tactic-decision-panel__list">
                {tacticRecommendations.map((rec) => (
                  <label key={rec.unitName} className="tactic-decision-panel__item">
                    <input
                      type="radio"
                      name="tactic-unit"
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
            <textarea
              className="tactic-decision-panel__note"
              value={tacticDecisionNote}
              onChange={(e) => setTacticDecisionNote(e.target.value)}
              placeholder="지휘관 메모 (선택)"
            />
            <div className="tactic-decision-panel__actions">
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedTacticUnit || tacticSavePending}
                onClick={() => {
                  void handleSaveTacticDecision()
                }}
              >
                {tacticSavePending ? '저장 중...' : '선택 전술 DB 저장'}
              </button>
              {tacticSaveMessage && <span className="muted">{tacticSaveMessage}</span>}
            </div>
          </section>
        )}

        {fmcwInRange && radarSnapshot && (
          <div className="radar-fmcw-panel" aria-label="펄스·FMCW 레이더 설명">
            <p className="radar-fmcw-panel__pulse-strip muted">
              시나리오: <strong>위성 SAR → UAV SAR(40km 밖)</strong> →{' '}
              <strong>펄스(광역)</strong> 약{' '}
              <strong>{radarSnapshot.pulse.radar.rangeMaxM.toLocaleString('ko-KR')} m</strong> — 지도{' '}
              <strong>보라 부채꼴</strong>·<strong>점</strong>.{' '}
              <strong>FMCW(근거리)</strong> 10~15km — 위상·방위·예측 경로·도플러 색 점.
            </p>
            <p className="radar-fmcw-panel__title">
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
                  live 실패 · 합성 탐지 표시
                </span>
              ) : null}
            </p>
            <p className="muted radar-fmcw-panel__text">{radarSnapshot.fmcw.meta.representationNote}</p>
            <p className="muted radar-fmcw-panel__text">{radarSnapshot.fmcw.meta.vodReferenceNote}</p>
            <details className="radar-methodology">
              <summary className="radar-methodology__summary">
                시나리오·예측·전처리·학습 (발표용 요약)
              </summary>
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
                <section className="radar-methodology__section radar-methodology__section--demo">
                  <h4 className="radar-methodology__h">이 데모 구현에 대해</h4>
                  <p className="muted">{radarSnapshot.fmcw.meta.methodology.demoImplementationNote}</p>
                </section>
              </div>
            </details>
            <ul className="radar-fmcw-panel__stats">
              <li>
                FMCW 최대 거리{' '}
                <strong>{radarSnapshot.fmcw.radar.rangeMaxM.toLocaleString('ko-KR')} m</strong> (펄스는 광역
                레이어 참조)
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
                지도에 <strong>예측 이동 경로</strong>(주황 점선: 도플러 외삽 등)·
                live 시 <strong>청록 실선</strong>은 <strong>속도 외삽 궤적</strong>(연속 레이더 프레임) 별도 레이어.
                <strong>위험 부채꼴·복도</strong>(붉은 반투명) — 적 핀이 <strong>FMCW 부채꼴 안</strong>이면 마우스 오버 시 3D
                요약.
              </li>
            </ul>
            {radarSnapshot.fmcw.detections.length > 0 && radarSnapshot.fmcw.insights && (
              <>
                <div className="radar-fmcw-insights" aria-label="파이프라인 입력·요약">
                  <h3 className="radar-fmcw-insights__title">입력 · 추론 요약 (동기 VoD 프레임)</h3>
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
                    <div className="radar-fmcw-vod-target" aria-label="3D 라벨 정합">
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

                <div className="radar-fmcw-synced" aria-label="동기 시점 카메라와 3D 레이더">
                  <div className="radar-fmcw-synced__pane">
                    <p className="radar-fmcw-synced__cap">2D · 카메라 입력 (YOLO 오버레이)</p>
                    <p className="muted radar-fmcw-synced__hint">
                      레이더·LiDAR와 동일 stem 프레임의 영상입니다.
                    </p>
                    {radarSnapshot.fmcw.insights.annotatedImageBase64 ? (
                      <img
                        src={`data:image/jpeg;base64,${radarSnapshot.fmcw.insights.annotatedImageBase64}`}
                        alt="YOLO 오버레이"
                        className="radar-fmcw-synced__img"
                      />
                    ) : (
                      <div className="radar-fmcw-synced__placeholder muted">
                        YOLO 오버레이 이미지 없음
                      </div>
                    )}
                  </div>
                  <div className="radar-fmcw-synced__pane">
                    <p className="radar-fmcw-synced__cap">3D · 레이더 클러스터 (ego 동기 시점)</p>
                    <p className="muted radar-fmcw-synced__hint">
                      차량 뒤쪽·소고도에서 전방 주시 방향을 바라봅니다.
                    </p>
                    {radarDetectionsCentroid ? (
                      <FmcwRadarScatter3D
                        key={`radar-sync-${radarSnapshot.fmcw.insights.frameId ?? ''}-${radarSnapshot.fmcw.detections.length}`}
                        rangeM={radarDetectionsCentroid.rangeM}
                        azimuthDeg={radarDetectionsCentroid.azimuthDeg}
                        elevationDeg={radarDetectionsCentroid.elevationDeg}
                        egoSyncView
                        className="radar-inline-viz__canvas3d"
                      />
                    ) : null}
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
            )}
            {radarSnapshot.fmcw.detections.length > 0 && !radarSnapshot.fmcw.insights && (
              <div className="radar-inline-viz" aria-label="FMCW 2D 및 3D 시각화">
                <div className="radar-inline-viz__block radar-inline-viz__block--2d">
                  <p className="radar-inline-viz__heading">2D 산점도 (탐지 전체)</p>
                  <p className="muted radar-inline-viz__hint">
                    Range–Azimuth, 수평면 x–y(m). 색은 도플러(접근·이탈).
                  </p>
                  <RadarCharts2D detections={radarSnapshot.fmcw.detections} />
                </div>
                {radarDetectionsCentroid && (
                  <div className="radar-inline-viz__block radar-inline-viz__block--3d">
                    <p className="radar-inline-viz__heading">3D 포인트 클라우드 (탐지 평균 기준)</p>
                    <p className="muted radar-inline-viz__hint">
                      VoD 스타일 모의 산점도. 축: 빨강=동, 초록=북, 파랑=상.
                    </p>
                    <FmcwRadarScatter3D
                      key={`radar-centroid-${radarSnapshot.fmcw.radar.id}-${radarSnapshot.fmcw.detections.length}`}
                      rangeM={radarDetectionsCentroid.rangeM}
                      azimuthDeg={radarDetectionsCentroid.azimuthDeg}
                      elevationDeg={radarDetectionsCentroid.elevationDeg}
                      className="radar-inline-viz__canvas3d"
                    />
                  </div>
                )}
              </div>
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
              <strong>레이더</strong>: <strong>보라 부채꼴·점</strong>=펄스(약 40km, SAR 확정 후),{' '}
              <strong>하늘 부채꼴·F·도플러 점</strong>=FMCW(약 10~15km, 시뮬 진행률 구간),{' '}
              <strong>주황 점선</strong>=FMCW 예측 이동 경로.
            </li>
          </ul>
        </div>
        <p className="muted">
          마커는 <strong>CustomOverlay + SVG</strong>로 그립니다. DB의 <code>symbolType</code>, <code>locationStatus</code>, <code>enemySymbol</code> 필드와 연동됩니다.
          <strong> 마우스를 올리면</strong> 핀 옆에 요약 정보가 뜨고, <strong>클릭하면</strong> 연결된 상황·정찰 영상을 큰 창에서 재생합니다. 시뮬레이션 재생 시 궤적이 함께 움직입니다.
        </p>
      </div>
      </>
      )}

      {mapVideoModal && (
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
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: '1rem' }}>
        <table className="dataset-table">
          <thead>
            <tr>
              <th>측</th>
              <th>전술 부호·표시</th>
              <th>명칭</th>
              <th>좌표</th>
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

      const response = await fetch(`${API_BASE_URL}/ai/yolo/image`, {
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

      const response = await fetch(`${API_BASE_URL}/ai/yolo/video`, {
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
      <p className="muted">담당: 유민, 태훈(작은)</p>
      <p>
        이미지/영상 업로드 및 실시간 카메라 입력에 대해 YOLO 기반 <strong>기갑·포병 등 전술 화력 표적</strong> 검출·피아
        분류·추적 결과를 표시합니다. (시스템 범위는 전술부대급 표적에 맞춥니다.)
      </p>
      <p className="muted">
        실시간 카메라 입력: <NavLink to="/monitor">실시간 카메라 관제 페이지로 이동</NavLink>
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
              샘플링 프레임: <strong>{videoResult.sampledFrames.toLocaleString('ko-KR')}</strong>
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
              <h4>샘플 프레임 미리보기</h4>
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
      <p className="muted">담당: 태훈(큰) · 도로/경로 연동</p>
      <p>객체별 거리 추정 결과 시각화, 임계 거리 기반 위험 경고, 시간축 거리 변화 로그를 제공합니다.</p>
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
        SAR·CCTV 연동 후 <strong>기갑·포병 등 전술 표적</strong>에 대한 거리 추정 및 위험지역 지도 시각화가 이 페이지에
        통합됩니다.
      </p>
    </section>
  )
}

function GuidePage() {
  return (
    <section className="page">
      <h1>사용 가이드</h1>
      <p className="muted">
        시스템 주요 기능을 직관적으로 안내합니다. 감시·추적 표적은 <strong>전술부대급(기갑·포병·관련 화력)</strong>으로
        한정하고, 광역 포착부터 전선 투입까지 동일 트랙을 가정합니다.
      </p>
      <ul style={{ lineHeight: 1.8, marginTop: '1rem' }}>
        <li>
          <strong>홈 (전술 감시 지도)</strong> – 광역 SAR로 잡은 <strong>기갑·포병 등 전술 표적</strong> 위치를 지도에
          올리고, 시뮬레이션으로 이동·투입 구간까지 데모 추적
        </li>
        <li>
          <strong>전차 식별/추적</strong> – 이미지·영상·실시간 카메라, YOLO 기반 전술 화력 표적 검출·피아 분류·추적
        </li>
        <li><strong>거리 분석</strong> – 객체별 거리 추정, 임계 거리 위험 경고, 시간축 거리 로그</li>
        <li>
          <strong>다중 센서 파이프라인</strong> – 위성(<strong>전술(기갑·포병) 표적</strong>·지형·기동 제한) → UAV(실시간
          추적·형상 분류) → 레이다 → 드론(식별·화력 연동) 및 지도 실시간 표시. 전략시설·격납고급은 범위에서 제외.{' '}
          <NavLink to="/sensor-pipeline">기술/웹 시나리오 문서형 UI</NavLink>
        </li>
        <li><strong>위험지역·경로</strong> – 포탄 위험지역 지도 표시 및 도로 기반 경로 탐색 (홈/거리 분석과 연동 예정)</li>
      </ul>
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        로그인 후 전 기능을 이용할 수 있으며, 실시간 경로 탐색 및 최적 경로 안내는 가입 완료 후 사용 가능합니다.
      </p>
    </section>
  )
}

/** 센서 파이프라인 페이지 데모 영상 — `public/media/demo-drone-map.mp4` (지도 시드 `적군-ALPHA`와 동일) */
const DEMO_DRONE_VIDEO_URL = '/media/yolo_tank_temp.mp4'

type SensorStepDef = {
  id: 'sat_sar' | 'uav_sar' | 'radar' | 'drone'
  title: string
  tag: string
  description: string
  technicalDetail: string
  scenarioDetail: string
  meta: { label: string; value: string }[]
}

/** 전체 기술 흐름 (개요) */
const SENSOR_TECHNICAL_FLOW_OVERVIEW: string[] = [
  '광역 SAR로 기갑·포병 등 전술부대급 표적의 대략적 위치·이동 흔적·지형(기동 제한)을 1차 포착합니다. 격납고·항만·작전부대 본부 등 전략·거점급과 규모를 섞지 않고, 아군 작전에 직접 영향을 주는 화력·기갑 편성만을 전제로 합니다.',
  '광역에서 지정된 전술 표적 구역에 UAV를 투입해 실시간 감시·추적하고, SAR 형상으로 전차·자주포·포병 지원 차량 등으로 종별을 좁힙니다.',
  '같은 표적 트랙이 레이더 사정거리에 들어오면 레이더로 고속 연속 추적합니다. UAV 단계의 표적 분류와 트랙을 결합합니다.',
  '레이더·UAV가 넘긴 좌표로 드론을 투입해 EO/IR로 식별·확정하고 화력 지원 등 교전을 연계합니다. 광역 포착부터 전선 투입까지 동일 표적으로 웹 지도·타임라인에 시각화합니다.',
]

/** 전체 웹 시나리오 흐름 (개요) */
const SENSOR_WEB_SCENARIO_OVERVIEW: string[] = [
  '지도에 광역 SAR로 잡힌 기갑·포병 표적(집결·기동 추정 위치)을 마커로 올리고, 클릭 시 추정 편성·위협 반경을 보여 전선 투입 전까지 맥락을 유지합니다. (격납고·거점급 시설 분석은 범위 밖으로 둡니다.)',
  '광역 정보상 기갑·포병 세력이 위험 방향으로 이동한 것으로 판단되면 UAV를 띄워 실시간 감시·추적합니다. SAR 형상으로 전차·자주포·포병 지원 차량 등을 구분하고, 지도에는 해당 전술 부호가 실시간 궤적으로 움직입니다.',
  '동일 표적이 레이더 사정거리 안으로 들어오면 레이더로 탐지·추적하고, 위치를 실시간으로 지도에 같은 부호로 표시합니다. (종별은 UAV 단계 결과를 재사용)',
  '해당 좌표로 드론을 투입해 식별·추적하고, 인근 아군에 화력 지원을 요청해 섬멸까지 웹에서 추적·표시합니다.',
]

const SENSOR_PIPELINE_STEPS: SensorStepDef[] = [
  {
    id: 'sat_sar',
    title: '위성 SAR',
    tag: '광역 · 전술(기갑·포병) 표적',
    description:
      '넓은 구역에서 기갑·포병 등 전술부대급 표적과 지형·이동 흔적을 1차로 포착하고, 전선 방향 위협 징후를 부여합니다.',
    technicalDetail:
      '전차·자주포·포병 편제에 해당하는 집결·열 개수와 이동 유무, 지형도를 확보합니다. 지형으로 기동 불가 구역을 갱신하고, 이동 흔적으로 전술 화력의 방향·속도를 추정합니다. (항공모함·고정 격납고 등 전략 자산은 본 프로젝트 범위에서 제외합니다.)',
    scenarioDetail:
      '예: 광역 패치에서 기갑·포병 집결·기동 추정 위치를 지도에 올리고, 클릭 시 추정 전차·포 수·위협 반경을 보여 전선 투입 전까지 동일 맥락으로 봅니다.',
    meta: [
      { label: '산출', value: '전술(기갑·포병) 동태, 이동 흔적, 지형(기동 제한 구역)' },
      { label: '웹 표시', value: '광역 관심 구역·표적 마커, 클릭 시 추정 규모·병과' },
      { label: '다음 트리거', value: '전술 표적 의심 구역 → UAV 태스크 생성' },
    ],
  },
  {
    id: 'uav_sar',
    title: 'UAV SAR / 감시',
    tag: '의심지 · 실시간 추적 · 형상 분류',
    description:
      '광역 단계에서 지정한 전술 표적 구역을 UAV로 실시간 감시·추적하고 SAR 형상으로 기갑·포병 종별을 좁힙니다.',
    technicalDetail:
      '광역에서 표시된 전술 표적 구역 상공에서 실시간 감시·정찰·추적을 수행합니다. SAR 형상으로 전차·자주포·포병 지원 차량 등을 구분합니다.',
    scenarioDetail:
      '기갑·포병 세력이 전선 쪽으로 이동한 것으로 판단되면 UAV를 띄우고, 지도에는 전차·자주포·포병 지원 등에 맞는 전술 부호가 실시간 궤적으로 움직입니다.',
    meta: [
      { label: '산출', value: '실시간 궤적, 표적 클래스(전차·자주포·포병 지원 등)' },
      { label: '웹 표시', value: '전술 부호 + 실시간 위치 갱신' },
      { label: '다음 트리거', value: '레이더 커버리지 진입 시 레이더 핸드오프' },
    ],
  },
  {
    id: 'radar',
    title: '레이다',
    tag: '사정거리 내 · 고속 추적',
    description: '레이더 사정거리 안으로 들어온 표적을 고속으로 탐지·추적하고 좌표를 지도와 동기화합니다.',
    technicalDetail:
      '동일 전술 표적 트랙이 레이더 범위에 들어오면 레이더로 연속 추적합니다. UAV에서 이미 전차·자주포·포병 지원 등으로 분류된 정보와 트랙을 결합합니다.',
    scenarioDetail:
      '레이더가 잡은 위치를 지도에 기존과 동일한 전술 부호로 실시간 표시합니다. (종별은 UAV 단계 결과를 재사용)',
    meta: [
      { label: '산출', value: '트랙 ID, 위치·속도, 갱신 주기' },
      { label: '웹 표시', value: '부호 동일 유지 + 레이더 갱신 위치' },
      { label: '다음 트리거', value: '최종 식별·교전을 위해 드론 투입 좌표 전달' },
    ],
  },
  {
    id: 'drone',
    title: '드론 (EO/IR)',
    tag: '식별 · 추적 · 화력 연동',
    description: '좌표 기반으로 드론을 투입해 적을 육안·AI로 식별·추적하고 화력 지원 요청까지 연계합니다.',
    technicalDetail:
      '레이더·UAV가 넘긴 좌표로 드론을 투입해 표적을 식별합니다. EO/IR 영상과 지도를 동기화하고, 필요 시 인근 부대 화력 지원·교전 결과를 웹에 반영합니다.',
    scenarioDetail:
      '드론이 해당 좌표로 접근해 적을 식별·추적하고, 인근 아군에 화력 지원을 요청해 섬멸까지의 상태를 지도·타임라인에서 추적할 수 있게 합니다.',
    meta: [
      { label: '산출', value: '영상 스트림, 식별 확정, 교전/BDA 상태' },
      { label: '웹 표시', value: '영상 오버레이, 지원 요청·교전 이벤트 (연동 예정)' },
      { label: '참고', value: '홈 SAR 지도의 드론 영상 핀과 동일 UX로 통합 가능' },
    ],
  },
]

/** 센서 파이프라인 «레이다» 단계 — `/map/radar/snapshot?source=live` + 홈과 동일 차트 */
function SensorPipelineRadarLivePanel() {
  const [snap, setSnap] = useState<RadarSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    void requestJson<RadarSnapshot>(`${API_BASE_URL}/map/radar/snapshot?source=live`)
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

  const centroid = useMemo(() => {
    if (!snap?.fmcw.detections.length) return null
    const dets = snap.fmcw.detections
    const n = dets.length
    let rangeM = 0
    let azimuthDeg = 0
    let elevationDeg = 0
    for (const d of dets) {
      rangeM += d.rangeM
      azimuthDeg += d.azimuthDeg
      elevationDeg += d.elevationDeg
    }
    return {
      rangeM: rangeM / n,
      azimuthDeg: azimuthDeg / n,
      elevationDeg: elevationDeg / n,
    }
  }, [snap])

  const live = snap?.fmcw.meta.liveRun

  if (loading) {
    return (
      <p className="muted sensor-radar-live">
        레이더 파이프라인(<code>?source=live</code>) 연결 중…
      </p>
    )
  }
  if (err || !snap) {
    return (
      <div className="sensor-radar-live">
        <p className="error">레이더 스냅샷을 불러오지 못했습니다. {err}</p>
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
            live 실패 — 합성 탐지 표시
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
                <p className="muted sensor-radar-live__hint">
                  색=도플러. Nest <code>/map/radar/snapshot?source=live</code> → Python DBSCAN.
                </p>
                <RadarCharts2D detections={dets} />
              </div>
              {centroid ? (
                <div>
                  <p className="sensor-radar-live__cap">3D (1위 클러스터 방향)</p>
                  <p className="muted sensor-radar-live__hint">고정 스케일 뷰.</p>
                  <FmcwRadarScatter3D
                    key={`sensor-radar-${String(live?.frameId ?? refreshKey)}-${dets.length}`}
                    rangeM={centroid.rangeM}
                    azimuthDeg={centroid.azimuthDeg}
                    elevationDeg={centroid.elevationDeg}
                    className="radar-inline-viz__canvas3d"
                  />
                </div>
              ) : null}
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
          <h1>다중 센서 파이프라인 (프로토타입)</h1>
          <p className="muted">
            <strong>위성 SAR → UAV → 레이다 → 드론(EO/IR)</strong> 순으로{' '}
            <strong>기갑·포병 등 전술부대급 표적</strong>을 좁히고, <strong>웹 지도에 실시간 시각화</strong>합니다. 표적
            범위는 전략시설·격납고급과 섞지 않으며, <strong>광역에서 포착한 동일 표적을 전선 투입 구간까지</strong> 이어
            추적한다는 전제입니다. 아래는 기술·웹 시나리오 개요이며, 단계를 선택하면 세부 내용이 강조됩니다.
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
                {step.id === 'radar' ? '실제 파이프라인 · /map/radar/snapshot?source=live' : '프로토타입 뷰'}
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
            {step.id === 'radar' && <SensorPipelineRadarLivePanel />}
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
  step: '1' | '2' | '3' | '4' | '5'
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2 className="brand">Hanhwa Final</h2>
        <nav className="sidebar-nav">
          <NavLink to="/sensor-pipeline">다중 센서 파이프라인</NavLink>
          <HomeScenarioNavLink step="1" label="1. 항공 SAR" />
          <HomeScenarioNavLink step="2" label="2. UAV SAR" />
          <HomeScenarioNavLink step="3" label="3. 펄스 레이더" />
          <HomeScenarioNavLink step="4" label="4. FMCW·VoD" />
          <HomeScenarioNavLink step="5" label="5. 통합 시뮬 (종합)" />
        </nav>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <div>
            <strong>데이터 분석 웹</strong>
          </div>
          <div className="topbar-right">
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
      const result = await requestJson<AuthResponse>(`${API_BASE_URL}/auth/login`, {
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
      <h1>Login</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="test@example.com"
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
      const result = await requestJson<AuthResponse>(`${API_BASE_URL}/auth/signup`, {
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
      <h1>Signup</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          이름(선택)
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="tester"
          />
        </label>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="test@example.com"
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

    void requestJson<User>(`${API_BASE_URL}/auth/me`, {
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
