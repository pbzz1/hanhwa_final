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

/** GRD 검출 지점과 SAR/UAV 거점이 이 거리(km) 이내일 때만 UAV/드론 출동 버튼 활성화(더미) */
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
  { id: 'grd-mot-1', cx: 125.88, cy: 38.88, classLabel: '전차', probPercent: 95 },
  { id: 'grd-mot-2', cx: 126.52, cy: 40.08, classLabel: '장갑차', probPercent: 78 },
  { id: 'grd-mot-3', cx: 129.12, cy: 40.62, classLabel: '전차', probPercent: 88 },
  { id: 'grd-mot-4', cx: 126.32, cy: 39.42, classLabel: '전차', probPercent: 92 },
  { id: 'grd-mot-5', cx: 127.38, cy: 39.5, classLabel: '차량', probPercent: 71 },
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
