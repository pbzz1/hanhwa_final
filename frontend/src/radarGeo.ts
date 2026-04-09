/**
 * 레이더(위경도)와 표적 간 거리·방위 — FMCW 커버리지 판정용
 */

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLng = toR(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 북 0°, 시계방향 (0~360) */
export function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toR = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(toR(lng2 - lng1)) * Math.cos(toR(lat2))
  const x =
    Math.cos(toR(lat1)) * Math.sin(toR(lat2)) -
    Math.sin(toR(lat1)) * Math.cos(toR(lat2)) * Math.cos(toR(lng2 - lng1))
  let brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

/** [-180, 180] */
export function angleDiffDeg(a: number, b: number): number {
  let d = a - b
  d = ((d + 540) % 360) - 180
  return d
}

export type RadarSite = {
  lat: number
  lng: number
  rangeMaxM: number
  fovDeg: number
  headingDeg: number
}

export function isEnemyInRadarCoverage(
  enemyLat: number,
  enemyLng: number,
  radar: RadarSite,
): boolean {
  const d = haversineMeters(radar.lat, radar.lng, enemyLat, enemyLng)
  if (d > radar.rangeMaxM) return false
  const bearing = bearingDeg(radar.lat, radar.lng, enemyLat, enemyLng)
  const diff = angleDiffDeg(bearing, radar.headingDeg)
  return Math.abs(diff) <= radar.fovDeg / 2
}

export type RadarTargetMetrics = {
  rangeM: number
  /** 북 기준 절대 방위 */
  azimuthDeg: number
  elevationDeg: number
  dopplerMps: number
  /** 레이더 주시 방위 대비 편각 (도) */
  offBoresightDeg: number
}

/** 고도·도플러는 시뮬레이션용 단순화 값 */
export function computeRadarTargetMetrics(
  enemyLat: number,
  enemyLng: number,
  radar: RadarSite,
  seedId: number,
): RadarTargetMetrics {
  const rangeM = haversineMeters(radar.lat, radar.lng, enemyLat, enemyLng)
  const azimuthDeg = bearingDeg(radar.lat, radar.lng, enemyLat, enemyLng)
  const offBoresightDeg = angleDiffDeg(azimuthDeg, radar.headingDeg)
  const elevationDeg = 0.8 + (seedId % 7) * 0.15
  const dopplerMps = -12 + (seedId % 19) * 0.7 + (rangeM / 8200) * -4

  return {
    rangeM,
    azimuthDeg: Math.round(azimuthDeg * 10) / 10,
    elevationDeg: Math.round(elevationDeg * 10) / 10,
    dopplerMps: Math.round(dopplerMps * 10) / 10,
    offBoresightDeg: Math.round(offBoresightDeg * 10) / 10,
  }
}
