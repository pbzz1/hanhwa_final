import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { MutableRefObject } from 'react'
import type { FormEvent } from 'react'
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import * as THREE from 'three'
import { AlertZonePage } from './AlertZonePage'
import { FmcwRadarScatter3D } from './FmcwRadarScatter3D'
import { RadarCharts2D } from './RadarCharts2D'
import {
  computeRadarTargetMetrics,
  isEnemyInRadarCoverage,
  type RadarSite,
} from './radarGeo'
import {
  BATTALION_SCENARIO,
  isBattalionC2Unit,
  isEnemyNearDmz38,
  pickPrimaryEnemyForDistance,
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

type Reconstruct3dMultiResponse = {
  sourceCount: number
  pairCount: number
  pointCount: number
  points3d: [number, number, number][]
  colorsRgb?: [number, number, number][]
  bounds: {
    x: [number, number]
    y: [number, number]
    z: [number, number]
  }
  ply?: {
    fileName?: string
    relativePath?: string | null
    downloadUrl?: string | null
    absolutePath?: string | null
  }
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
/** 시뮬 진행률이 이 값 이상이면 레이더 이펙트·경보 2단계(데모) */
const RADAR_REVEAL_PROGRESS = 0.12

type SimPoint = { lat: number; lng: number }

type SimPathBundle = {
  friendly: Map<number, SimPoint[]>
  enemy: Map<number, SimPoint[]>
}

function buildFriendlyPath(baseLat: number, baseLng: number, seed: number): SimPoint[] {
  const out: SimPoint[] = []
  for (let i = 0; i <= SIM_PATH_STEPS; i += 1) {
    const t = i / SIM_PATH_STEPS
    // t=0, t=1 에서 원점(부대 좌표)으로 돌아오도록 envelope 적용
    const envelope = Math.sin(t * Math.PI)
    const wobbleLat =
      envelope *
      (0.12 * Math.sin(t * Math.PI * 2.2 + seed * 0.07) +
        0.06 * Math.sin(t * Math.PI * 5 + seed * 0.03))
    const wobbleLng =
      envelope *
      (0.1 * Math.cos(t * Math.PI * 1.9 + seed * 0.09) +
        0.05 * Math.cos(t * Math.PI * 4.5 + seed * 0.05))
    out.push({ lat: baseLat + wobbleLat, lng: baseLng + wobbleLng })
  }
  return out
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
    jobs.push(
      (async () => {
        const { points, fromRoad } = await fetchRoadRoundTripPath(
          u.lat,
          u.lng,
          u.id * 17 + u.name.length,
          false,
        )
        friendly.set(u.id, points)
        if (fromRoad) roadCount += 1
      })(),
    )
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

function dopplerMarkerColor(dopplerMps: number): string {
  if (dopplerMps <= -4) return '#1d4ed8'
  if (dopplerMps >= 4) return '#dc2626'
  return '#64748b'
}

type ApplySimFrameOpts = {
  radarSite: RadarSite | null
  primaryEnemyId: number | null
  sarContact: boolean
  onPrimaryEnemyRadarDetect?: (detected: boolean) => void
  onPrimaryEnemyNearDmz38?: (near: boolean) => void
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
    pin.setMap(map)
    const infoOpen = info.getMap?.() != null
    info.setPosition(ll)
    if (infoOpen) {
      info.setMap(map)
    }
    if (typeof circle.setPosition === 'function') {
      circle.setPosition(ll)
    } else {
      circle.setOptions?.({ center: ll })
    }

    if (opts?.radarSite && opts.sarContact) {
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
    addListener: (target: unknown, type: string, callback: () => void) => void
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
  } = ctx

  const primaryForInset = insetMinimal
    ? pickPrimaryEnemyForDistance(enemyInfiltrations)
    : null
  const friendlySource = insetMinimal
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
    pinEl.className = 'kakao-tactical-pin-anchor'
    if (isBattalionC2Unit(unit)) {
      pinEl.classList.add('kakao-tactical-pin-anchor--c2')
    }
    pinEl.title = `아군 · ${unit.level} | ${unit.name} · ${TACTICAL_SYMBOL_LABEL[unit.symbolType]}`
    pinEl.innerHTML = buildFriendlyTacticalPinHTML(unit)

    const pinOverlay = new kakaoMaps.CustomOverlay({
      map,
      position,
      yAnchor: 1,
      xAnchor: 0.5,
      content: pinEl,
      zIndex: 3,
    })

    const infoContent = document.createElement('div')
    infoContent.className = insetMinimal
      ? 'unit-infowindow unit-infowindow-friendly unit-map-overlay map-hover-side-card map-hover-side-card--friendly map-hover-side-card--minimal'
      : 'unit-infowindow unit-infowindow-friendly unit-map-overlay map-hover-side-card map-hover-side-card--friendly'
    infoContent.innerHTML = insetMinimal
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

    const infoOverlay = new kakaoMaps.CustomOverlay({
      position,
      yAnchor: 0.5,
      xAnchor: 0,
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

    const infoOverlay = new kakaoMaps.CustomOverlay({
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
  /** SAR로 적 표적 확정 후 true — 노란 거리선·1차 경보 */
  const [sarContact, setSarContact] = useState(false)
  const [radarEnemyHover, setRadarEnemyHover] = useState<EnemyInfiltration | null>(null)
  const radarHoverLeaveTimerRef = useRef<number | null>(null)

  const radarEngaged = sarContact && simProgress >= RADAR_REVEAL_PROGRESS
  /** FMCW: 근거리 부채꼴·상세 탐지·예측 경로 */
  const radarFmcwForMap = radarEngaged && radarSnapshot ? radarSnapshot : null
  /** 펄스: 광역(약 40km) — SAR 확정 후 점 탐지만 */
  const radarPulseForMap = sarContact && radarSnapshot ? radarSnapshot : null

  const radarSnapshotRef = useRef<RadarSnapshot | null>(null)
  radarSnapshotRef.current = radarSnapshot

  const radarDiscoveryAnnouncedRef = useRef(false)
  const [enemyRadarDiscovered, setEnemyRadarDiscovered] = useState(false)
  const [enemyNearDmz38, setEnemyNearDmz38] = useState(false)
  const enemyNearDmzPrevRef = useRef(false)

  const simFrameOptsRef = useRef<ApplySimFrameOpts | undefined>(undefined)
  simFrameOptsRef.current = {
    radarSite: (radarSnapshot?.fmcw.radar as RadarSite) ?? null,
    primaryEnemyId: pickPrimaryEnemyForDistance(enemyInfiltrations)?.id ?? null,
    sarContact,
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

  useEffect(() => {
    if (!mapVideoModal) return undefined
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMapVideoModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapVideoModal])

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
    void requestJson<RadarSnapshot>(`${API_BASE_URL}/map/radar/snapshot`)
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
    const opts = simFrameOptsRef.current
    if (scene) applySimulationFrame(scene, simPaths, simProgressRef.current, opts)
    if (inset) applySimulationFrame(inset, simPaths, simProgressRef.current, opts)
  }, [simPaths])

  const handleSimReset = useCallback(() => {
    simProgressRef.current = 0
    setSimProgress(0)
    setSimPlaying(false)
    radarDiscoveryAnnouncedRef.current = false
    setEnemyRadarDiscovered(false)
    enemyNearDmzPrevRef.current = false
    setEnemyNearDmz38(false)
    const scene = sceneRef.current
    const inset = insetSceneRef.current
    const opts = simFrameOptsRef.current
    if (simPaths) {
      if (scene) applySimulationFrame(scene, simPaths, 0, opts)
      if (inset) applySimulationFrame(inset, simPaths, 0, opts)
    }
  }, [simPaths])

  const handleSimTogglePlay = useCallback(() => {
    setSimPlaying((wasPlaying) => {
      if (wasPlaying) {
        return false
      }
      if (simProgressRef.current >= 0.999) {
        simProgressRef.current = 0
        setSimProgress(0)
        radarDiscoveryAnnouncedRef.current = false
        setEnemyRadarDiscovered(false)
        enemyNearDmzPrevRef.current = false
        setEnemyNearDmz38(false)
        const scene = sceneRef.current
        const inset = insetSceneRef.current
        const opts = simFrameOptsRef.current
        if (simPaths) {
          if (scene) applySimulationFrame(scene, simPaths, 0, opts)
          if (inset) applySimulationFrame(inset, simPaths, 0, opts)
        }
      }
      return true
    })
  }, [simPaths])

  useEffect(() => {
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
        map.setBounds(new kakaoMaps.LatLngBounds(mainSw, mainNe), 52, 52, 52, 52)
        map.setZoomable(false)

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
        insetMap.setBounds(new kakaoMaps.LatLngBounds(insetSw, insetNe), 28, 28, 28, 28)
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
        }

        const mainPins = attachKakaoTacticalPins({
          ...pinCtxBase,
          map,
          enableRadarHoverPanel: true,
        })

        const radarDisposables: Array<
          | KakaoPolygonInstance
          | KakaoCustomOverlayInstance
          | KakaoCircleInstance
          | KakaoPolylineInstance
        > = []

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

          const track = radarFmcwForMap.fmcw.track
          if (track && track.predictedPath.length >= 2) {
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
              <span class="radar-fmcw-track-label__title">FMCW 예측</span>
              <span class="radar-fmcw-track-label__row">방위 <strong>${track.bearingDeg}°</strong> · 위상 기준 <strong>${track.phaseRefDeg}°</strong></span>
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
          insetMinimal: sarContact,
        })

        const c2Unit = friendlyUnits.find(isBattalionC2Unit)
        const primaryEnemy = pickPrimaryEnemyForDistance(enemyInfiltrations)
        let c2Line: KakaoPolylineInstance | undefined
        let distOv: KakaoCustomOverlayInstance | undefined
        let distEl: HTMLDivElement | undefined
        let c2Uid: number | undefined
        let eid: number | undefined

        if (c2Unit && primaryEnemy && sarContact) {
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
          const o = simFrameOptsRef.current
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
      sceneRef.current = null
      insetSceneRef.current = null
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = ''
      }
      if (insetMapContainerRef.current) {
        insetMapContainerRef.current.innerHTML = ''
      }
    }
  }, [friendlyUnits, enemyInfiltrations, radarSnapshot, sarContact, radarEngaged])

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
      const o = simFrameOptsRef.current
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
  }, [simPlaying, simSpeed, simPaths])

  return (
    <section className="page">
      <h1>{BATTALION_SCENARIO.title}</h1>
      <p className="muted">
        {BATTALION_SCENARIO.subtitle} — <strong>제1기갑대대 지휘통제실</strong>을 중심으로 한 작전구역입니다. 큰 지도는
        SAR 전차 소실 의심 구역, 작은 지도는 적·아군 대치와 지휘통제실까지 거리를 보여 줍니다.
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
        <h2 className="map-title">대대 전술 상황도 (지휘통제실 · SAR · 대치)</h2>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          시뮬레이션은 <strong>도로·합성 궤적</strong>으로 표적 이동을 보여 줍니다. 레이더(FMCW)·위성(SAR) 탐지는 데모
          합성 데이터입니다.
        </p>
        <div className="sim-toolbar">
          <button
            type="button"
            className="btn-secondary"
            disabled={mapLoading || sarContact}
            onClick={() => setSarContact(true)}
            title="광역 SAR로 표적을 확정하면 1차 경보·거리선이 표시됩니다"
          >
            SAR 광역 탐지
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!simPaths || mapLoading}
            onClick={handleSimTogglePlay}
          >
            {simPlaying ? '일시정지' : '시뮬레이션 재생'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!simPaths || mapLoading}
            onClick={handleSimReset}
          >
            처음으로
          </button>
          <label className="sim-speed-label">
            속도
            <select
              value={simSpeed}
              disabled={!simPaths || mapLoading}
              onChange={(e) => setSimSpeed(Number(e.target.value) as 0.5 | 1 | 2)}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </label>
          <div className="sim-progress-wrap" aria-hidden>
            <div className="sim-progress-bar" style={{ width: `${simProgress * 100}%` }} />
          </div>
          <span className="muted sim-progress-label">
            {Math.round(simProgress * 100)}% · 전술 표적 이동 데모 (약 {SIM_DURATION_SEC}초 기준 1×)
          </span>
        </div>
        {roadPathStatus === 'loading' && (
          <p className="muted road-path-hint">
            <strong>도로 궤적</strong> 계산 중(OSRM driving, 백엔드 프록시)… 잠시 후 핀이 실제 도로망을
            따릅니다.
          </p>
        )}
        {roadPathStatus === 'all-road' && (
          <p className="muted road-path-hint">
            시뮬레이션: 주 적 표적은 <strong>남하 침공 단방향</strong>, 아군은 <strong>도로 왕복</strong> 궤적입니다.
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
        {mapLoading && <p className="muted">지도 데이터 로딩 중...</p>}

        {!sarContact && (
          <div className="scenario-standby-banner" role="status">
            <span className="scenario-standby-banner__badge">대기</span>
            <span>
              <strong>광역 SAR 탐지</strong>로 적 표적을 확정하면 1차 경보가 발령됩니다. 이후 시뮬 재생 시 남하
              침공이 진행되면 레이더 이펙트와 2차 경보가 뜹니다.
            </span>
          </div>
        )}
        {sarContact && !radarEngaged && (
          <div className="scenario-sar-alert" role="alert">
            <span className="scenario-sar-alert__badge">1차</span>
            <span>
              <strong>SAR 접촉</strong> — 기갑급 표적 식별. 지휘통제실–표적 거리선(노란 1선) 활성.
            </span>
          </div>
        )}
        {enemyRadarDiscovered && (
          <div className="scenario-discover-alert" role="alert">
            <span className="scenario-discover-alert__badge">적 발견</span>
            <span>
              <strong>레이더 접촉</strong> — 남하 중인 표적이 FMCW 센서 부채꼴 안으로 들어왔습니다. 지도에 선택
              표시가 켜집니다.
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
        {radarEngaged && (
          <div className="scenario-red-alert" role="alert">
            <span className="scenario-red-alert__badge">2차</span>
            <span>
              <strong>전투경계 · 레이더 접촉</strong> — 적 대대 남하 중, FMCW 탐지·부채꼴 표시(데모).
            </span>
          </div>
        )}

        <div
          className={`map-battalion-grid${sarContact ? ' map-battalion-grid--tactical-focus' : ''}`}
        >
          <div className="map-battalion-col map-battalion-col--overview">
            <h3 className="map-subtitle">SAR 광역 현황 (전차 신호 소실 구역)</h3>
            <p className="muted map-subtitle-hint">
              붉은 원은 <strong>SAR 변화분석</strong>으로 전차급 표적이 사라진 의심 구역입니다. 지도는 가림 없이 동일하게
              표시합니다.
            </p>
            <div className="map-with-radar-hover">
              <div className="map-overview-stack">
                <div ref={mapContainerRef} className="maplibre-container map-main-overview" />
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
            </div>
          </div>
          <div className="map-battalion-col map-battalion-col--inset">
            <h3 className="map-subtitle">
              {sarContact ? '전술 대치 · 접촉 표적' : '전술 대치 (레이더·위성 탐지)'}
            </h3>
            {sarContact ? (
              <p className="muted map-subtitle-hint map-subtitle-hint--tactical-minimal">
                지휘통제실–우선 표적 거리만 표시합니다.
              </p>
            ) : (
              <p className="muted map-subtitle-hint">
                NATO 스타일 전술 부호로 아군을 표시합니다. SAR 확정 후 <strong>노란 한 줄</strong>로 지휘통제실–우선
                적 표적 거리(km)를 봅니다.
              </p>
            )}
            <div
              className={`map-inset-stack${sarContact ? ' map-inset-stack--focus' : ''}`}
            >
              <div ref={insetMapContainerRef} className="maplibre-container map-inset-tactical" />
              {radarEngaged && <div className="radar-sweep-overlay" aria-hidden />}
            </div>
          </div>
        </div>
        {radarEngaged && radarSnapshot && (
          <div className="radar-fmcw-panel" aria-label="펄스·FMCW 레이더 설명">
            <p className="radar-fmcw-panel__pulse-strip muted">
              <strong>펄스(광역)</strong> 사거리 약{' '}
              <strong>{radarSnapshot.pulse.radar.rangeMaxM.toLocaleString('ko-KR')} m</strong> — 지도{' '}
              <strong>보라 부채꼴</strong>·<strong>점</strong>만 표시.{' '}
              <strong>FMCW(근거리)</strong> 약 10~15km — 위상·방위·예측 경로(주황 점선)·도플러 색 점.
            </p>
            <p className="radar-fmcw-panel__title">
              <strong>{radarSnapshot.fmcw.radar.label}</strong>
              <span className="radar-fmcw-panel__chip">센서: {radarSnapshot.fmcw.meta.sensor}</span>
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
                지도에 <strong>예측 이동 경로</strong>(주황 점선)·방위·위상 라벨 — 적 핀이{' '}
                <strong>FMCW 부채꼴 안</strong>이면 마우스 오버 시 3D 요약.
              </li>
            </ul>
            {radarSnapshot.fmcw.detections.length > 0 && (
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

function DistanceTrackingPage() {
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<Reconstruct3dMultiResponse | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setResult(null)

    if (files.length < 3) {
      setError('최소 3장의 이미지를 선택해 주세요.')
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      setError('로그인 토큰이 없습니다. 다시 로그인해 주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('files', file)
      }

      const response = await fetch(`${API_BASE_URL}/ai/reconstruct/points-multi`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: AbortSignal.timeout(600_000),
      })
      const data = (await response.json().catch(() => ({}))) as Reconstruct3dMultiResponse & {
        message?: string
      }
      if (!response.ok) {
        const msg =
          typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message?: string }).message)
            : '멀티 이미지 3D 복원 요청에 실패했습니다.'
        throw new Error(msg)
      }
      if (
        !data ||
        !Array.isArray(data.points3d) ||
        data.points3d.length === 0 ||
        !data.bounds
      ) {
        throw new Error('복원된 3D 점이 없습니다.')
      }
      setResult(data as Reconstruct3dMultiResponse)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '3D 점 복원 처리 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (!viewerRef.current || !result || result.points3d.length === 0) {
      return
    }

    const container = viewerRef.current
    container.innerHTML = ''

    const width = container.clientWidth || 900
    const height = 420

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#020617')

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 1000)
    camera.position.set(0, 0, 3.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    const points = result.points3d
    const bounds = result.bounds
    const centerX = (bounds.x[0] + bounds.x[1]) / 2
    const centerY = (bounds.y[0] + bounds.y[1]) / 2
    const centerZ = (bounds.z[0] + bounds.z[1]) / 2
    const spanX = Math.max(bounds.x[1] - bounds.x[0], 1e-6)
    const spanY = Math.max(bounds.y[1] - bounds.y[0], 1e-6)
    const spanZ = Math.max(bounds.z[1] - bounds.z[0], 1e-6)
    const scale = 2.2 / Math.max(spanX, spanY, spanZ)

    const positions = new Float32Array(points.length * 3)
    const colors = new Float32Array(points.length * 3)

    for (let i = 0; i < points.length; i += 1) {
      const [x, y, z] = points[i]
      positions[i * 3] = (x - centerX) * scale
      positions[i * 3 + 1] = (y - centerY) * scale
      positions[i * 3 + 2] = (z - centerZ) * scale

      const c = result.colorsRgb?.[i]
      colors[i * 3] = c ? c[0] / 255 : 0.58
      colors[i * 3 + 1] = c ? c[1] / 255 : 0.77
      colors[i * 3 + 2] = c ? c[2] / 255 : 0.98
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    })
    const cloud = new THREE.Points(geometry, material)
    scene.add(cloud)

    const axis = new THREE.AxesHelper(0.7)
    scene.add(axis)

    let frameId = 0
    const animate = () => {
      cloud.rotation.y += 0.0032
      cloud.rotation.x += 0.0008
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      container.innerHTML = ''
    }
  }, [result])

  return (
    <section className="page">
      <h1>전차 3D 점 복원 (멀티 이미지)</h1>
      <p className="muted">담당: 수빈</p>
      <p>여러 시점 이미지를 함께 입력해 전차의 3D 점군을 더 안정적으로 복원합니다.</p>

      <form className="form yolo-upload-form" onSubmit={handleSubmit}>
        <label>
          이미지 파일들 (최소 3장)
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? '복원 중...' : '3D 점 복원 실행'}
        </button>
      </form>
      <p className="muted">선택된 파일 수: {files.length}장</p>
      {isSubmitting && (
        <p className="muted">3D 복원에 2~3분 걸릴 수 있습니다. 완료될 때까지 기다려 주세요.</p>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="yolo-result">
          <h3>멀티 뷰 복원 결과</h3>
          <p className="muted">
            입력 이미지 수: {result.sourceCount}장 / 페어 수: {result.pairCount}
          </p>
          <div className="video-summary-grid">
            <p>
              복원 포인트 수: <strong>{result.pointCount.toLocaleString('ko-KR')}</strong>
            </p>
            {result.ply?.downloadUrl && (
              <p>
                PLY 파일:{' '}
                <a
                  href={`http://127.0.0.1:8001${result.ply.downloadUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  새 탭에서 열기 / 다운로드
                </a>
              </p>
            )}
          </div>

          <div className="point-cloud-wrap" ref={viewerRef} />
          <p className="muted">Three.js 기반 3D 점군 뷰어 (자동 회전)</p>
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
        <li><strong>3D 모델링 (MASt3R)</strong> – 멀티뷰 3D 점군 복원, 포신 자세 추정 기반 위협 분석</li>
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
const DEMO_DRONE_VIDEO_URL = '/media/demo-drone-map.mp4'

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
              <span className="sensor-viewport-badge">프로토타입 뷰</span>
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
            {step.id === 'radar' && (
              <div className="sensor-radar-wrap" aria-hidden>
                <div className="sensor-radar-rings" />
                <div className="sensor-radar-sweep" />
                <div className="sensor-radar-blips">
                  <span className="blip" style={{ top: '32%', left: '58%' }} />
                  <span className="blip blip--dim" style={{ top: '48%', left: '44%' }} />
                  <span className="blip" style={{ top: '62%', left: '52%' }} />
                </div>
              </div>
            )}
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

function AppLayout({ user, onLogout }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2 className="brand">Hanhwa Final</h2>
        <nav className="sidebar-nav">
          <NavLink to="/" end>홈 (전술 지도 · 원본)</NavLink>
          <NavLink to="/alert-zone">경보 구역 (강서구)</NavLink>
          <NavLink to="/identification">전차 식별/추적</NavLink>
          <NavLink to="/distance-analysis">거리 분석</NavLink>
          <NavLink to="/distance-tracking">3D 모델링 (MASt3R)</NavLink>
          <NavLink to="/sensor-pipeline">다중 센서 파이프라인</NavLink>
          <NavLink to="/guide">사용 가이드</NavLink>
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
        <Route path="/distance-tracking" element={<DistanceTrackingPage />} />
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
