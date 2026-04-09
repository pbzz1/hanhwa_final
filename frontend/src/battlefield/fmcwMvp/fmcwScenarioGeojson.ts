import type { GeoJSONSource } from 'maplibre-gl'

/** 함흥 권역 위험 윤곽 + 예상 진입축 + mock 트랙 점 (단일 소스) */
const FMCW_SCENARIO_GEOJSON_DATA = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'risk', name: 'FMCW 위험 윤곽(더미)' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.58, 39.78],
            [127.88, 39.78],
            [127.88, 39.62],
            [127.58, 39.62],
            [127.58, 39.78],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'ingress', name: '예상 진입 축선(더미)' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.52, 39.58],
          [127.62, 39.64],
          [127.72, 39.7],
          [127.8, 39.74],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'track', trackId: 'FMCW-T01', label: '고속 접근체' },
      geometry: { type: 'Point', coordinates: [127.66, 39.66] },
    },
    {
      type: 'Feature',
      properties: { kind: 'track', trackId: 'FMCW-T02', label: 'MBT 유사' },
      geometry: { type: 'Point', coordinates: [127.74, 39.71] },
    },
    {
      type: 'Feature',
      properties: { kind: 'track', trackId: 'FMCW-T03', label: 'APC 후보' },
      geometry: { type: 'Point', coordinates: [127.6, 39.73] },
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
