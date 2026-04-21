/**
 * 전장 서비스 — 적 MBT·GRD 표적의 OSRM 도로 기반 남하 궤적 (백엔드 /map/route/driving 프록시)
 */

export type MarchPoint = { lat: number; lng: number }

/** 시나리오 엔티티 id → 남하 목표(도로 라우팅 종점). 북한·동해안 일대에서 남쪽으로 잡음 */
export const BATTLEFIELD_MBT_MARCH_GOALS: Record<number, MarchPoint> = {
  // 군사분계선(MDL) 근사(위도 약 38°) 부근까지 남하하도록 종점을 조정
  9001: { lat: 37.99, lng: 126.42 },
  9002: { lat: 37.88, lng: 127.22 },
  // 요청 반영: 제2기갑여단 예하 부대는 최종 남하를 소폭 줄여 레이더 범위 내에서 종료
  9003: { lat: 38.04, lng: 127.14 },
  9004: { lat: 38.16, lng: 126.76 },
  9005: { lat: 37.98, lng: 126.12 },
  9006: { lat: 38.05, lng: 127.33 },
  9007: { lat: 38.22, lng: 127.74 },
  9008: { lat: 37.83, lng: 126.28 },
  9009: { lat: 37.95, lng: 126.66 },
  9010: { lat: 37.78, lng: 126.92 },
  // 서부 축도 해상(황해) 쪽으로 빠지지 않도록 내륙 쪽 목표로 고정
  9050: { lat: 37.98, lng: 126.34 },
}

/**
 * 적 남하 경로는 한반도 작전권역 북측 확장 bbox 안에서만 허용.
 * (중국 서부/서해 먼바다 우회 경로 차단 목적)
 */
const ENEMY_MARCH_LAND_BOUNDS = {
  south: 36.5,
  north: 41.8,
  west: 124.8,
  east: 129.8,
} as const

export function isEnemyMarchLandPoint(point: MarchPoint): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  return (
    point.lat >= ENEMY_MARCH_LAND_BOUNDS.south &&
    point.lat <= ENEMY_MARCH_LAND_BOUNDS.north &&
    point.lng >= ENEMY_MARCH_LAND_BOUNDS.west &&
    point.lng <= ENEMY_MARCH_LAND_BOUNDS.east
  )
}

/** OSRM/보간에서 동해·황해로 튀는 비현실적 점프(해상 횡단) 차단 — 한반도 MBT 궤적 데모용 */
const ENEMY_MARCH_MAX_SEGMENT_KM = 85

export function isEnemyMarchLandPolyline(polyline: MarchPoint[]): boolean {
  if (!Array.isArray(polyline) || polyline.length < 2) return false
  if (!polyline.every((point) => isEnemyMarchLandPoint(point))) return false
  for (let i = 1; i < polyline.length; i += 1) {
    if (haversineKm(polyline[i - 1]!, polyline[i]!) > ENEMY_MARCH_MAX_SEGMENT_KM) return false
  }
  return true
}

/**
 * MBT 핀이 서해·동해 연안 밖으로 나가는 경우를 줄이기 위한 러프 보정(실제 해안선 미사용).
 * 함흥~원산 일대에서 동경이 크면 동해상으로 찍히는 TRK 표적 완화.
 */
export function snapEnemyMbtPoseToLandCorridor(p: MarchPoint): MarchPoint {
  let { lat, lng } = p
  if (lat >= 38.35 && lat <= 41.45 && lng < 126.02) {
    lng = Math.max(lng, 126.02)
  }
  if (lat >= 37.35 && lat <= 38.95 && lng < 125.42) {
    lng = Math.max(lng, 125.42)
  }
  // 북한 동부(함흥·원산 축): 동경이 너무 크면 대부분 동해 면상 → 육지 쪽으로 상한
  if (lat >= 38.45 && lat <= 41.55 && lng > 127.92) {
    lng = Math.min(lng, 127.92)
  }
  if (lat >= 37.2 && lat < 38.45 && lng > 129.05) {
    lng = Math.min(lng, 129.05)
  }
  if (lng > 129.32) {
    lng = Math.min(lng, 129.25)
  }
  return { lat, lng }
}

/** OSRM 궤적 정점을 육상 보정(연안 밖 정점 누적 방지) */
export function snapMarchPolylineVertices(poly: MarchPoint[]): MarchPoint[] {
  return poly.map((pt) => snapEnemyMbtPoseToLandCorridor(pt))
}

function haversineKm(a: MarchPoint, b: MarchPoint): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** 각 정점까지 누적 거리(미터) */
export function buildCumulativeM(poly: MarchPoint[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < poly.length; i += 1) {
    cum.push(cum[i - 1]! + haversineKm(poly[i - 1]!, poly[i]!) * 1000)
  }
  return cum
}

/** 폴리라인을 따라 distanceM 지점의 좌표 (OSRM 점 밀도가 높아 선형 보간으로 충분) */
export function positionAlongPolylineM(
  poly: MarchPoint[],
  cumM: number[],
  distanceM: number,
): MarchPoint {
  if (poly.length === 0) return { lat: 0, lng: 0 }
  if (poly.length === 1) return { ...poly[0]! }
  const total = cumM[cumM.length - 1]!
  const d = Math.min(Math.max(0, distanceM), total - 1e-6)
  let i = 1
  while (i < cumM.length && cumM[i]! < d) i += 1
  const c0 = cumM[i - 1]!
  const c1 = cumM[i]!
  const segM = c1 - c0
  const t = segM > 1e-6 ? (d - c0) / segM : 0
  const a = poly[i - 1]!
  const b = poly[i]!
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

/**
 * 현재 위치에 가장 가까운 폴리라인 꼭짓점까지의 누적 거리(미터).
 * OSRM 점 밀도가 높을 때 드론 등을 궤적 위에 올리는 데 사용.
 */
export function alongMForNearestPathVertex(
  poly: MarchPoint[],
  cumM: number[],
  point: MarchPoint,
): number {
  if (poly.length === 0 || cumM.length !== poly.length) return 0
  let bestIdx = 0
  let bestDKm = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const dKm = haversineKm(point, poly[i]!)
    if (dKm < bestDKm) {
      bestDKm = dKm
      bestIdx = i
    }
  }
  return cumM[bestIdx] ?? 0
}

const WEST_COAST_LAND_GUARD_LNG = 126.2
/** 북한 동해안 데모: 128°대는 면상이 많아 남하 보조선 상한을 육지 쪽으로 제한 */
const EAST_COAST_LAND_GUARD_LNG = 127.92

function interpolatePolyline(points: MarchPoint[], steps: number): MarchPoint[] {
  if (points.length <= 1) return points.length === 1 ? [{ ...points[0]! }] : []
  const cumKm: number[] = [0]
  for (let i = 1; i < points.length; i += 1) {
    cumKm.push(cumKm[i - 1]! + haversineKm(points[i - 1]!, points[i]!))
  }
  const totalKm = cumKm[cumKm.length - 1]!
  if (totalKm <= 1e-6) return [{ ...points[0]! }, { ...points[points.length - 1]! }]

  const out: MarchPoint[] = []
  for (let s = 0; s <= steps; s += 1) {
    const targetKm = totalKm * (s / steps)
    let seg = 1
    while (seg < cumKm.length && cumKm[seg]! < targetKm) seg += 1
    const a = points[seg - 1]!
    const b = points[Math.min(seg, points.length - 1)]!
    const k0 = cumKm[seg - 1]!
    const k1 = cumKm[Math.min(seg, cumKm.length - 1)]!
    const segKm = k1 - k0
    const t = segKm > 1e-6 ? (targetKm - k0) / segKm : 0
    out.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    })
  }
  return out
}

/** OSRM 실패 시 육상 우회 경유 경로를 사용해 해상 횡단을 방지 */
export function fallbackStraightMarchPolyline(from: MarchPoint, to: MarchPoint, steps = 80): MarchPoint[] {
  const clampLandLng = (lng: number) => Math.min(EAST_COAST_LAND_GUARD_LNG, Math.max(lng, WEST_COAST_LAND_GUARD_LNG))
  const safeFrom: MarchPoint = { lat: from.lat, lng: clampLandLng(from.lng) }
  const safeTo: MarchPoint = { lat: to.lat, lng: clampLandLng(to.lng) }
  const trunkLng = Math.max(safeFrom.lng, safeTo.lng)
  const midLat = (safeFrom.lat + safeTo.lat) / 2

  const anchors: MarchPoint[] = [
    from,
    safeFrom,
    { lat: midLat, lng: trunkLng },
    safeTo,
    to,
  ].filter((point, idx, arr) => {
    if (idx === 0) return true
    const prev = arr[idx - 1]!
    return Math.abs(prev.lat - point.lat) > 1e-8 || Math.abs(prev.lng - point.lng) > 1e-8
  })

  return interpolatePolyline(anchors, steps).map((pt) => snapEnemyMbtPoseToLandCorridor(pt))
}

export function drivingRouteRequestUrl(apiBase: string, from: MarchPoint, to: MarchPoint): string {
  const base = apiBase.replace(/\/$/, '')
  return `${base}/map/route/driving?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`
}
