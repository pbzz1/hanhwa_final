import hamhungToReconBnRoute from './hamhungToReconBnRoute.json'

/**
 * SAR MVP — 관측 구역·남하축·GRD 변화검출 GeoJSON (mock)
 */

export const SAR_OBSERVATION_ZONE_GEOJSON = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: {
        id: 'sar2-wide-zone',
        name: 'SAR-2 광역 관측 지역',
        note: '함흥 축선 SAR 위성 정보 소실 구간',
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [127.56, 39.94],
            [127.9, 39.94],
            [127.9, 39.72],
            [127.56, 39.72],
            [127.56, 39.94],
          ],
        ],
      },
    },
  ],
}

/**
 * 함흥 집결 → 감시부대 대대 방면 예상 기동로
 * - 북측: OSRM(Project-OSRM)·OSM 도로 driving (함흥→원산→남단 인근)
 * - 남측: OSRM driving (강릉 인근→대대 지휘소 좌표)
 * - 군사분계 비연결 구간: 직선 보간(데모)
 */
export const SAR_ENEMY_MOVEMENT_ROUTE_GEOJSON = hamhungToReconBnRoute as unknown as {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, unknown>
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  }>
}

export type SarMovementRouteTooltipProps = {
  name: string
  tankCount: number
  moveProbability: number
  moveHeadingDeg: number
  moveDirectionLabel: string
  routeSource?: string
  targetUnit?: string
}

export function parseMovementRouteTooltipProps(
  raw: Record<string, unknown> | null | undefined,
): SarMovementRouteTooltipProps | null {
  if (!raw) return null
  const name = String(raw.name ?? '이동 예상 구간')
  const tankCount = Number(raw.tankCount)
  const moveProbability = Number(raw.moveProbability)
  const moveHeadingDeg = Number(raw.moveHeadingDeg)
  const moveDirectionLabel = String(raw.moveDirectionLabel ?? '')
  if (
    !Number.isFinite(tankCount) ||
    !Number.isFinite(moveProbability) ||
    !Number.isFinite(moveHeadingDeg)
  ) {
    return null
  }
  const routeSource = raw.routeSource != null ? String(raw.routeSource) : undefined
  const targetUnit = raw.targetUnit != null ? String(raw.targetUnit) : undefined

  return {
    name,
    tankCount,
    moveProbability,
    moveHeadingDeg,
    moveDirectionLabel,
    routeSource,
    targetUnit,
  }
}

/** GRD 검출 지점과 SAR/UAV 거점이 이 거리(km) 이내일 때만 UAV/드론 출동 버튼 활성화 */
export const GRD_DISPATCH_RANGE_KM = 220

export const GRD_FALLBACK_SAR_UAV_ORIGIN = { lat: 37.67, lng: 126.95 } as const

function grdMotionBlobRing(cx: number, cy: number): [number, number][] {
  return [
    [cx - 0.11, cy - 0.05],
    [cx + 0.07, cy - 0.07],
    [cx + 0.12, cy + 0.03],
    [cx + 0.02, cy + 0.08],
    [cx - 0.09, cy + 0.04],
    [cx - 0.11, cy - 0.05],
  ]
}

const GRD_DETECTION_SPEC = [
  // 전차(적색) 2개는 요청대로 주요 적 부대 위치(제1기갑대대·제2기갑여단 예하 부대)에 정렬
  { id: 'grd-mot-1', cx: 125.7625, cy: 39.0392, classLabel: '전차', probPercent: 95 }, // Track 49001 근처
  { id: 'grd-mot-2', cx: 127.485, cy: 39.723, classLabel: '전차', probPercent: 88 }, // E49003 근처
  { id: 'grd-mot-3', cx: 127.535, cy: 39.8417, classLabel: '전차', probPercent: 78 }, // 함흥 축선 보조 전차 후보
  // 일반차량(청색)은 적 주력 2축과 겹치지 않게 분리 배치
  { id: 'grd-mot-4', cx: 126.96, cy: 38.98, classLabel: '일반차량', probPercent: 92 },
  { id: 'grd-mot-5', cx: 126.34, cy: 39.46, classLabel: '일반차량', probPercent: 71 },
] as const

export const GRD_MOTION_DETECTIONS_GEOJSON = {
  type: 'FeatureCollection' as const,
  features: GRD_DETECTION_SPEC.map((row) => ({
    type: 'Feature' as const,
    id: row.id,
    properties: {
      motionId: row.id,
      classLabel: row.classLabel,
      probPercent: row.probPercent,
      centerLat: row.cy,
      centerLng: row.cx,
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [grdMotionBlobRing(row.cx, row.cy)],
    },
  })),
}

export const GRD_MOTION_META: Record<
  string,
  { centerLat: number; centerLng: number; classLabel: string; probPercent: number }
> = Object.fromEntries(
  GRD_DETECTION_SPEC.map((row) => [
    row.id,
    {
      centerLat: row.cy,
      centerLng: row.cx,
      classLabel: row.classLabel,
      probPercent: row.probPercent,
    },
  ]),
)

/** GeoJSON 링 [lng,lat][] — 외곽 링 기준 ray casting (구멍 미처리, MVP 폴리곤 전제) */
export function pointInLngLatRing(lng: number, lat: number, ring: [number, number][]): boolean {
  if (ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]
    const yi = ring[i]![1]
    const xj = ring[j]![0]
    const yj = ring[j]![1]
    const crossesMeridian = yi > lat !== yj > lat
    if (!crossesMeridian) continue
    const xInt = ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (lng < xInt) inside = !inside
  }
  return inside
}

/** WGS84 점이 GRD(이동 검출) 폴리곤 안에 들어가는 motionId 목록 */
export function findGrdMotionIdsContainingPoint(lat: number, lng: number): string[] {
  const hits: string[] = []
  for (const f of GRD_MOTION_DETECTIONS_GEOJSON.features) {
    if (f.geometry.type !== 'Polygon') continue
    const outer = f.geometry.coordinates[0] as [number, number][]
    if (!outer?.length) continue
    if (pointInLngLatRing(lng, lat, outer)) {
      const id = String(f.properties.motionId ?? f.id ?? '')
      if (id) hits.push(id)
    }
  }
  return hits
}

/** 모든 GRD 클러스터(이동 픽셀 후보) 폴리곤을 포함하도록 지도 fitBounds 할 때 사용 */
export function computeGrdMotionDetectionsBounds(): {
  west: number
  south: number
  east: number
  north: number
} {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const f of GRD_MOTION_DETECTIONS_GEOJSON.features) {
    if (f.geometry.type !== 'Polygon') continue
    for (const ring of f.geometry.coordinates) {
      for (const coord of ring) {
        const lng = coord[0]
        const lat = coord[1]
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
        west = Math.min(west, lng)
        east = Math.max(east, lng)
        south = Math.min(south, lat)
        north = Math.max(north, lat)
      }
    }
  }
  if (!Number.isFinite(west)) {
    return { west: 125.5, south: 38.5, east: 129.5, north: 41.0 }
  }
  const padLng = 0.42
  const padLat = 0.32
  return {
    west: west - padLng,
    south: south - padLat,
    east: east + padLng,
    north: north + padLat,
  }
}
