import type { RadarDetectionPoint } from './RadarCharts2D'

/** FMCW 인트로 페이지용 고정 탐지 샘플 (API 없이 차트 시연) */
export const FMCW_INTRO_DETECTIONS: RadarDetectionPoint[] = [
  {
    id: 'intro-1',
    rangeM: 7800,
    azimuthDeg: 8,
    elevationDeg: 1.8,
    dopplerMps: -3.1,
    confidence: 0.91,
    phaseDeg: 42,
  },
  {
    id: 'intro-2',
    rangeM: 11200,
    azimuthDeg: 15,
    elevationDeg: 2.4,
    dopplerMps: 5.2,
    confidence: 0.84,
    phaseDeg: 118,
  },
  {
    id: 'intro-3',
    rangeM: 9600,
    azimuthDeg: 11,
    elevationDeg: 0.9,
    dopplerMps: 0.4,
    confidence: 0.76,
    phaseDeg: 205,
  },
]
