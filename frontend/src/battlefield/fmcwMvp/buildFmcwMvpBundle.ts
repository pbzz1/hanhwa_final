import { haversineKm, pointInRing, ringCentroid, type LatLng } from './fmcwMath'
import {
  type FmcwFriendlyEngagement,
  type FmcwMvpBundle,
  FMCW_APPROACH_SPEED_MPS,
  FMCW_DETECTION_RANGE_KM,
  FMCW_MOCK_TRACKS,
} from './fmcwMockData'
import { FMCW_RISK_RING } from './fmcwScenarioGeojson'

type AssetLike = {
  name: string
  category: string
  lat: number
  lng: number
}

function strikeAssessment(
  category: string,
  distKm: number,
  inZone: boolean,
): { strikeCapable: boolean; rationale: string } {
  const intelOnly = category === 'SAR' || category === 'UAV' || category === 'DRONE'
  if (intelOnly) {
    return {
      strikeCapable: false,
      rationale: '정찰·감시 자산 — 직접 화력 배제',
    }
  }
  if (category === 'ARTILLERY') {
    if (distKm <= 42) {
      return {
        strikeCapable: true,
        rationale: inZone
          ? '포병 사거리 내 · 위험구역 경계 근접'
          : '포병 사거리 내 간접 사격 가능',
      }
    }
    return { strikeCapable: false, rationale: '사거리 한계 추정 초과' }
  }
  if (category === 'ARMOR') {
    if (distKm <= 28) {
      return {
        strikeCapable: true,
        rationale: inZone
          ? '기갑 직접 교전 거리'
          : '기동 타격 반경 내',
      }
    }
    return { strikeCapable: false, rationale: '기갑 전개 거리 밖' }
  }
  if (category === 'DIVISION' || category === 'UPPER_COMMAND') {
    if (distKm <= 55) {
      return {
        strikeCapable: distKm <= 24,
        rationale:
          distKm <= 24
            ? 'C2·화력 조정 가능 구역'
            : '지휘 거점은 간접 조정만 가능',
      }
    }
    return { strikeCapable: false, rationale: '작전 깊이 밖' }
  }
  return { strikeCapable: false, rationale: '유형 미분류' }
}

export function buildFmcwMvpBundle(assets: AssetLike[]): FmcwMvpBundle {
  const centroid = ringCentroid(FMCW_RISK_RING)
  const c: LatLng = { lat: centroid.lat, lng: centroid.lng }

  const engagements: FmcwFriendlyEngagement[] = assets.map((a) => {
    const p = { lat: a.lat, lng: a.lng }
    const distanceKm = haversineKm(p, c)
    const inZone = pointInRing(a.lng, a.lat, FMCW_RISK_RING)
    const { strikeCapable, rationale } = strikeAssessment(a.category, distanceKm, inZone)
    return {
      assetName: a.name,
      category: a.category,
      distanceKm,
      strikeCapable,
      rationale,
    }
  })

  engagements.sort((x, y) => x.distanceKm - y.distanceKm)

  const ingressBearingDeg = 38

  return {
    zoneLabel: '함흥 남쪽 · FMCW 위험 윤곽',
    detectionRangeKm: FMCW_DETECTION_RANGE_KM,
    approachSpeedMps: FMCW_APPROACH_SPEED_MPS,
    ingressSummary: `남서→북동 축, 대략 ${ingressBearingDeg}° 방위로 위험구역 진입 예측`,
    ingressBearingDeg,
    tracks: FMCW_MOCK_TRACKS,
    engagements,
    radarReportLines: [
      `탐지 거리(설정): ${FMCW_DETECTION_RANGE_KM.toFixed(1)} km — 근거리 FMCW 가정`,
      `접근 속도(추정): ${FMCW_APPROACH_SPEED_MPS.toFixed(1)} m/s — 트랙 T01/T02 융합`,
      '예상 진입 경로: 위험 폴리곤 서남단→북동 코어(지도 주황 점선)',
      `활성 트랙 ${FMCW_MOCK_TRACKS.length}개 — BEV·트랙 리스트(추정)`,
    ],
  }
}
