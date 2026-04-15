/**
 * 전장 서비스 — 적 MBT·GRD 표적의 OSRM 도로 기반 남하 궤적 (백엔드 /map/route/driving 프록시)
 */

export type MarchPoint = { lat: number; lng: number }

/** 시나리오 엔티티 id → 남하 목표(도로 라우팅 종점). 북한·동해안 일대에서 남쪽으로 잡음 */
export const BATTLEFIELD_MBT_MARCH_GOALS: Record<number, MarchPoint> = {
  // 38선(위도 약 38도) 부근까지 남하하도록 종점을 조정
  9001: { lat: 37.99, lng: 126.42 },
  9002: { lat: 38.02, lng: 127.44 },
  // 요청 반영: 제2기갑여단 예하 부대는 최종 남하를 소폭 줄여 레이더 범위 내에서 종료
  9003: { lat: 38.18, lng: 127.36 },
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

export function isEnemyMarchLandPolyline(polyline: MarchPoint[]): boolean {
  if (!Array.isArray(polyline) || polyline.length < 2) return false
  return polyline.every((point) => isEnemyMarchLandPoint(point))
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

const WEST_COAST_LAND_GUARD_LNG = 126.2

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
  const safeFrom: MarchPoint = { lat: from.lat, lng: Math.max(from.lng, WEST_COAST_LAND_GUARD_LNG) }
  const safeTo: MarchPoint = { lat: to.lat, lng: Math.max(to.lng, WEST_COAST_LAND_GUARD_LNG) }
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

  return interpolatePolyline(anchors, steps)
}

export function drivingRouteRequestUrl(apiBase: string, from: MarchPoint, to: MarchPoint): string {
  const base = apiBase.replace(/\/$/, '')
  return `${base}/map/route/driving?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`
}
