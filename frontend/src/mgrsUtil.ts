import { forward } from 'mgrs'

/** MGRS는 극지역(약 ±80°~84° 밖)에서 정의가 제한됩니다. */
function isLatInMgrsRange(lat: number): boolean {
  return lat >= -80 && lat <= 84
}

/**
 * WGS84 위·경도 → MGRS 문자열.
 * @param accuracy 5=1m, 4=10m, 3=100m (mgrs 패키지 규약)
 */
export function latLngToMgrsSafe(
  lat: number,
  lng: number,
  accuracy: number = 5,
): string {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—'
    if (!isLatInMgrsRange(lat)) return '—'
    return forward([lng, lat], accuracy)
  } catch {
    return '—'
  }
}

export function formatLatLngReadout(lat: number, lng: number): string {
  return `위도 ${lat.toFixed(5)}° · 경도 ${lng.toFixed(5)}°`
}

/** 푸터·한 줄 요약: WGS84 + MGRS */
export function formatLatLngWithMgrsReadout(lat: number, lng: number): string {
  const wgs = formatLatLngReadout(lat, lng)
  const m = latLngToMgrsSafe(lat, lng)
  return m !== '—' ? `${wgs} · MGRS ${m}` : wgs
}
