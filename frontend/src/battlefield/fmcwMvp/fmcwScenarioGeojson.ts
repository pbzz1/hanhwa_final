import type { GeoJSONSource } from 'maplibre-gl'

/** 함흥 권역 위험 윤곽 + 예상 진입축 + 추정 트랙 점 (단일 소스) — 동해상이 아닌 내륙·평야 쪽에 배치 */
const FMCW_SCENARIO_GEOJSON_DATA = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'risk', name: 'FMCW 위험 윤곽' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.34, 39.79],
            [127.52, 39.79],
            [127.52, 39.62],
            [127.34, 39.62],
            [127.34, 39.79],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'ingress', name: '예상 진입 축선' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.30, 39.56],
          [127.38, 39.62],
          [127.44, 39.68],
          [127.48, 39.74],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'track', trackId: 'FMCW-T01', label: '고속 접근체' },
      geometry: { type: 'Point', coordinates: [127.41, 39.67] },
    },
    {
      type: 'Feature',
      properties: { kind: 'track', trackId: 'FMCW-T02', label: 'MBT 유사' },
      geometry: { type: 'Point', coordinates: [127.47, 39.71] },
    },
    {
      type: 'Feature',
      properties: { kind: 'track', trackId: 'FMCW-T03', label: 'APC 후보' },
      geometry: { type: 'Point', coordinates: [127.38, 39.73] },
    },
  ],
}

export const FMCW_SCENARIO_GEOJSON = FMCW_SCENARIO_GEOJSON_DATA as Parameters<
  GeoJSONSource['setData']
>[0]

const riskFeature = FMCW_SCENARIO_GEOJSON_DATA.features[0] as unknown as {
  geometry: { coordinates: [number, number][][] }
}
export const FMCW_RISK_RING: [number, number][] = riskFeature.geometry.coordinates[0]!
