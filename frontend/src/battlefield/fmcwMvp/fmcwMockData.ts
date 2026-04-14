export type FmcwMockTrack = {
  trackId: string
  classLabel: string
  rangeM: number
  speedMps: number
  bearingDeg: number
  threatNote: string
}

export type FmcwFriendlyEngagement = {
  assetName: string
  category: string
  distanceKm: number
  strikeCapable: boolean
  rationale: string
}

export type FmcwMvpBundle = {
  zoneLabel: string
  detectionRangeKm: number
  approachSpeedMps: number
  ingressSummary: string
  ingressBearingDeg: number
  tracks: FmcwMockTrack[]
  engagements: FmcwFriendlyEngagement[]
  radarReportLines: string[]
}

export const FMCW_DETECTION_RANGE_KM = 80

export const FMCW_APPROACH_SPEED_MPS = 12.4

/** 추정 트랙 리스트 */
export const FMCW_MOCK_TRACKS: FmcwMockTrack[] = [
  {
    trackId: 'FMCW-T01',
    classLabel: '고속 접근체',
    rangeM: 4200,
    speedMps: 13.1,
    bearingDeg: 38,
    threatNote: '다중 경로 일치',
  },
  {
    trackId: 'FMCW-T02',
    classLabel: 'MBT 유사',
    rangeM: 6100,
    speedMps: 11.8,
    bearingDeg: 42,
    threatNote: '드론 EO와 동일 축',
  },
  {
    trackId: 'FMCW-T03',
    classLabel: 'APC 후보',
    rangeM: 7800,
    speedMps: 10.2,
    bearingDeg: 35,
    threatNote: '저RCS · 보조 트랙',
  },
]
