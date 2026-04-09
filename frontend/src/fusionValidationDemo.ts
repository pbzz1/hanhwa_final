import type { RadarDetectionPoint } from './RadarCharts2D'

/** 프로토타입: 우선 표적 1개 + 잡음 2개 (FMCW 모델 출력 시뮬) */
export const DEMO_FMCW_DETECTIONS: RadarDetectionPoint[] = [
  {
    id: 'tgt-primary',
    rangeM: 8420,
    azimuthDeg: 9.2,
    elevationDeg: 2.1,
    dopplerMps: -4.2,
    confidence: 0.94,
    phaseDeg: 55,
  },
  {
    id: 'clutter-1',
    rangeM: 15400,
    azimuthDeg: -22,
    elevationDeg: 0.5,
    dopplerMps: 0.1,
    confidence: 0.41,
    phaseDeg: 10,
  },
  {
    id: 'clutter-2',
    rangeM: 5200,
    azimuthDeg: 44,
    elevationDeg: 3.2,
    dopplerMps: 1.8,
    confidence: 0.52,
    phaseDeg: 200,
  },
]

export const DEMO_MODEL_META = {
  name: 'fmcw_detector_vod_stub',
  checkpoint: 'vod-radar-camera/weights/fmcw_bev_epoch72.pt',
  device: 'CUDA · batch 1',
  inferMs: 38,
  frameId: '00000',
} as const

export const DEMO_LIDAR_VALIDATION = {
  /** 레이더 1차 탐지와 독립 LiDAR 처리 파이프라인 결과 */
  clusterRangeM: 8395,
  clusterAzimuthDeg: 9.0,
  clusterElevationDeg: 2.05,
  numPointsInRoi: 184,
  iouBevProxy: 0.87,
  deltaRangeM: 25,
  deltaBearingDeg: 0.2,
  verdict: '일치',
} as const
