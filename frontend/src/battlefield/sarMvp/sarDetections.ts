import hamhungToReconBnRoute from './hamhungToReconBnRoute.json'

/**
 * SAR MVP — 관측 구역·남하축·GRD 변화검출 GeoJSON (mock)
 */

export const SAR_OBSERVATION_ZONE_GEOJSON = {
  type: 'FeatureCollection' as const,
  /** 광역을 먼저·스팟라이트를 나중에 두어 같은 fill 레이어에서 스팟라이트가 위에 그려지고 히트 테스트도 우선되게 함 */
  features: [
    {
      type: 'Feature' as const,
      properties: {
        id: 'sar2-wide-zone',
        name: 'ScanSAR 광역 탐지 지역',
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            // 광역 탐지: 중심(126.7, 39.0) 유지 · 이전 대비 가로·세로 약 40% 축소(×0.6)
            [125.188, 39.864],
            [128.212, 39.864],
            [128.212, 38.136],
            [125.188, 38.136],
            [125.188, 39.864],
          ],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: {
        id: 'sar2-spotlight-zone',
        name: '위성 SAR 집중 탐지 지역',
        note: 'SAR-2 스팟라이트(15×15) 정밀 관측 구역',
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [127.34, 39.8],
            [127.68, 39.8],
            [127.68, 39.58],
            [127.34, 39.58],
            [127.34, 39.8],
          ],
        ],
      },
    },
  ],
}

/** `sar2-spotlight-zone` 외접 사각형 — 지도 포커스·UI 연동용 */
export const SAR_SPOTLIGHT_ZONE_BOUNDS = {
  west: 127.34,
  south: 39.58,
  east: 127.68,
  north: 39.8,
} as const

/** 겹침 구간에서 광역보다 스팟라이트 히트를 우선(맵 이벤트 features[0]이 광역인 경우 방지) */
export function pickSarObservationZoneHit<T extends { properties?: Record<string, unknown> | null | undefined }>(
  features: readonly T[] | undefined | null,
): T | undefined {
  if (!features?.length) return undefined
  const spotlight = features.find((f) => String(f.properties?.id ?? '') === 'sar2-spotlight-zone')
  if (spotlight) return spotlight
  return features[0]
}

/**
 * 함흥 집결 → 감시부대 대대 방면 예상 기동로
 * - 북측: OSRM(Project-OSRM)·OSM 도로 driving (함흥→원산→남단 인근)
 * - 남측: OSRM driving (강릉 인근→대대 지휘소 좌표)
 * - 동해 면상 횡단 구간은 천내·내륙 축 보간으로 대체(데모)
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

/** 노란색(전차) GRD 링 가시성 강화 — 기존 대비 2배 확대 */
export const GRD_TANK_MOTION_RING_SCALE = 2.56

/** 파란색(일반차량) 이동 검출 링 — 기본 대비 2배 */
export const GRD_BLUE_MOTION_RING_SCALE = 2

export function grdMotionBlobRing(cx: number, cy: number, scale = 1): [number, number][] {
  // 중심점(cx, cy)을 기준으로 대칭 링을 사용해 마커와 시각 중심이 정확히 겹치도록 유지
  const rx = 0.038 * scale
  const ry = 0.03 * scale
  return [
    [cx - rx, cy],
    [cx - rx * 0.45, cy - ry],
    [cx + rx * 0.55, cy - ry * 0.82],
    [cx + rx, cy + ry * 0.12],
    [cx + rx * 0.38, cy + ry],
    [cx - rx * 0.58, cy + ry * 0.86],
    [cx - rx, cy],
  ]
}

export const GRD_DETECTION_SPEC = [
  /**
   * 요청 반영:
   * - 사각 범위(2번째 이미지) 내부 적 집결 지역은 모두 노란색 GRD(전차)로 표기
   * - 파란색 GRD(일반차량)는 범위 외곽으로 분리해 서로 겹치지 않게 배치
   */
  // 노란색(전차): 화면에 보이는 적 TRK 표식 중심과 최대한 직접 매핑
  { id: 'grd-mot-1', cx: 126.06, cy: 39.66, classLabel: '전차', probPercent: 95 }, // TRK49050
  { id: 'grd-mot-2', cx: 126.03, cy: 39.31, classLabel: '전차', probPercent: 89 }, // TRK58
  { id: 'grd-mot-3', cx: 126.04, cy: 38.99, classLabel: '전차', probPercent: 84 }, // TRK48
  { id: 'grd-mot-4', cx: 126.02, cy: 38.72, classLabel: '전차', probPercent: 82 }, // TRK52
  { id: 'grd-mot-5', cx: 127.47, cy: 39.67, classLabel: '전차', probPercent: 88 }, // TRK49 (내동리 인근)
  { id: 'grd-mot-6', cx: 127.03, cy: 39.03, classLabel: '전차', probPercent: 81 }, // TRK50
  // 파란색(일반차량): 박스 하단 바깥으로 완전히 분리 배치
  { id: 'grd-mot-7', cx: 125.52, cy: 38.58, classLabel: '일반차량', probPercent: 70 },
  { id: 'grd-mot-8', cx: 126.62, cy: 38.54, classLabel: '일반차량', probPercent: 73 },
  { id: 'grd-mot-9', cx: 127.56, cy: 38.60, classLabel: '일반차량', probPercent: 76 },
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
      coordinates: [
        grdMotionBlobRing(
          row.cx,
          row.cy,
          row.classLabel === '전차' ? GRD_TANK_MOTION_RING_SCALE : GRD_BLUE_MOTION_RING_SCALE,
        ),
      ],
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
