/**
 * 위성 SAR 4기 — 단순 궤도·관측면(데모)
 * - 궤도: ~90분 주기(LEO 느낌), 지상 투영 속도 ~7.5 km/s에 맞춘 각속도
 * - Spotlight: 15 km × 15 km
 * - 광역(ScanSAR 느낌): 반경 ~140 km (200–500 km 스와스를 원으로 근사)
 */

export const ORBITAL_SAR_IDS = [96101, 96102, 96103, 96104] as const
export type OrbitalSarId = (typeof ORBITAL_SAR_IDS)[number]

export const ORBITAL_SAR_NAMES = [
  '위성 SAR-01',
  '위성 SAR-02',
  '위성 SAR-03',
  '위성 SAR-04',
] as const

/** 궤도 주기(초) — 약 90분 */
export const ORBITAL_PERIOD_SEC = 90 * 60

/** 지상 궤적 각속도(rad/s) — 2π / T */
const ORBITAL_OMEGA = (2 * Math.PI) / ORBITAL_PERIOD_SEC

const INCL_DEG = [51, 53, 49, 52] as const
const RAAN_DEG = [0, 100, 200, 280] as const
const PHASE0 = [0, Math.PI / 3, (2 * Math.PI) / 3, (4 * Math.PI) / 3] as const

export const ORBITAL_SLOT_BY_ID: Record<number, number> = {
  96101: 0,
  96102: 1,
  96103: 2,
  96104: 3,
}

export function isOrbitalSarAssetId(id: number): boolean {
  return ORBITAL_SLOT_BY_ID[id] != null
}

export function normalizeLng180(lng: number): number {
  let x = lng
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

/** 슬롯별 지상 투영(위도·경도, deg) — 원형 LEO를 단순화한 경사궤도 */
export function orbitalGroundPosition(slotIndex: number, orbitalSeconds: number): { lat: number; lng: number } {
  const inc = (INCL_DEG[slotIndex]! * Math.PI) / 180
  const Ω = (RAAN_DEG[slotIndex]! * Math.PI) / 180
  const θ = ORBITAL_OMEGA * orbitalSeconds + PHASE0[slotIndex]!
  const latRad = Math.asin(Math.min(1, Math.max(-1, Math.sin(inc) * Math.sin(θ))))
  let lngRad = Math.atan2(Math.cos(inc) * Math.sin(θ), Math.cos(θ)) + Ω
  lngRad = ((lngRad + Math.PI) % (2 * Math.PI)) - Math.PI
  return {
    lat: (latRad * 180) / Math.PI,
    lng: normalizeLng180((lngRad * 180) / Math.PI),
  }
}

function groundFromTheta(slotIndex: number, θ: number): { lat: number; lng: number } {
  const inc = (INCL_DEG[slotIndex]! * Math.PI) / 180
  const Ω = (RAAN_DEG[slotIndex]! * Math.PI) / 180
  const latRad = Math.asin(Math.min(1, Math.max(-1, Math.sin(inc) * Math.sin(θ))))
  let lngRad = Math.atan2(Math.cos(inc) * Math.sin(θ), Math.cos(θ)) + Ω
  lngRad = ((lngRad + Math.PI) % (2 * Math.PI)) - Math.PI
  return {
    lat: (latRad * 180) / Math.PI,
    lng: normalizeLng180((lngRad * 180) / Math.PI),
  }
}

/** 궤도선(LineString 좌표 [lng,lat]) */
export function orbitalTraceLine(slotIndex: number, steps = 360): [number, number][] {
  const ring: [number, number][] = []
  for (let k = 0; k <= steps; k += 1) {
    const θ = (2 * Math.PI * k) / steps
    const { lat, lng } = groundFromTheta(slotIndex, θ)
    ring.push([lng, lat])
  }
  return ring
}

function offsetKm(centerLat: number, centerLng: number, northKm: number, eastKm: number) {
  const dLat = northKm / 111.32
  const dLng = eastKm / (111.32 * Math.cos((centerLat * Math.PI) / 180))
  return { lat: centerLat + dLat, lng: normalizeLng180(centerLng + dLng) }
}

/** 15 km × 15 km 정사각형(지상 근사) */
export function spotlightFootprintRing(centerLat: number, centerLng: number, halfKm = 7.5): [number, number][] {
  const nw = offsetKm(centerLat, centerLng, halfKm, -halfKm)
  const ne = offsetKm(centerLat, centerLng, halfKm, halfKm)
  const se = offsetKm(centerLat, centerLng, -halfKm, halfKm)
  const sw = offsetKm(centerLat, centerLng, -halfKm, -halfKm)
  return [
    [nw.lng, nw.lat],
    [ne.lng, ne.lat],
    [se.lng, se.lat],
    [sw.lng, sw.lat],
    [nw.lng, nw.lat],
  ]
}

/** 광역 탐지 — 원형 스와스 근사 (반경 km) */
export function wideFootprintRing(centerLat: number, centerLng: number, radiusKm = 140, segments = 56): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= segments; i += 1) {
    const a = (2 * Math.PI * i) / segments
    const northKm = radiusKm * Math.cos(a)
    const eastKm = radiusKm * Math.sin(a)
    const p = offsetKm(centerLat, centerLng, northKm, eastKm)
    ring.push([p.lng, p.lat])
  }
  return ring
}

export type SarObservationMode = 'SPOTLIGHT' | 'WIDE'

export function buildOrbitalTracesGeoJson(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: ORBITAL_SAR_IDS.map((id, slot) => ({
      type: 'Feature',
      id,
      properties: { id, slot, name: ORBITAL_SAR_NAMES[slot]! },
      geometry: {
        type: 'LineString',
        coordinates: orbitalTraceLine(slot),
      },
    })),
  }
}

export function buildOrbitalFootprintsGeoJson(
  positions: ReadonlyArray<{ id: number; lat: number; lng: number }>,
  modes: Readonly<Record<number, SarObservationMode>>,
): GeoJSON.FeatureCollection {
  const colors = ['rgba(34,197,94,0.22)', 'rgba(56,189,248,0.2)', 'rgba(250,204,21,0.18)', 'rgba(244,114,182,0.2)']
  return {
    type: 'FeatureCollection',
    features: positions.map((p, idx) => {
      const mode = modes[p.id] ?? 'SPOTLIGHT'
      const ring =
        mode === 'SPOTLIGHT' ? spotlightFootprintRing(p.lat, p.lng) : wideFootprintRing(p.lat, p.lng)
      return {
        type: 'Feature',
        id: p.id + 100000,
        properties: {
          parentId: p.id,
          mode,
          fillColor: colors[idx % colors.length]!,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      }
    }),
  }
}
