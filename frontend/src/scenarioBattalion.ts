/**
 * 대대(지휘통제실) 압축 시나리오 — 큰 지도(SAR)·작은 지도(대치) 공통 상수
 * 아군: 휴전선 이남 / 적: 이북 — 시뮬 남하 침공
 */

/**
 * 대대(지휘통제실) 기준 거리.
 * 개념 순서: 위성 SAR → UAV SAR(40km 밖) → 전술 권역(40km 이내) → FMCW(15km 이내).
 */
/**
 * 시뮬 진행률(0~1) 폴백 — 주 적 궤적이 남하 관측 권역(파란 사각형)에 진입하는 시점을 못 구할 때만,
 * 이 진행률 이후에 소형 표적(블립)을 켭니다. 정상 시에는 궤적 기하로 진입률을 계산합니다.
 */
export const SAR_ENEMY_BLIP_PROGRESS = 0.065
/** 이 진행률 이상이면 재생 일시정지·UAV 출정 승인(적 포착 연출 이후) */
export const SAR_WIDE_SCAN_PAUSE_PROGRESS = 0.14

/** 통합 시뮬 광역 지도: 평양 SAR 소실 표시 후 이 시간(ms) 뒤 남하 경로 관측 권역 표시 */
export const BATTALION_ROUTE_CORRIDOR_REVEAL_MS = 4000

/** 주 적 남하 시뮬 출발지 — 평양 시청 일대 근사(WGS84), SAR 소실 원과 동일 중심 */
export const BATTALION_PYONGYANG_INVASION_ORIGIN = {
  lat: 39.0392,
  lng: 125.7625,
} as const

export const SCENARIO_RANGES_KM = {
  /** 군사분계선 인근 전술 권역 — 이보다 멀면 UAV SAR 광역 추적 단계로 표현 */
  TACTICAL_RANGE_KM: 40,
  FMCW_MAX: 15,
  /** 정찰 드론 출동·현장 EO/IR 촬영 — C2~주 적 거리 기준, FMCW 권과 동일 */
  DRONE_DISPATCH_MAX_KM: 15,
} as const

export const BATTALION_SCENARIO = {
  title: '다층 감시 · 통합 상황판',
  subtitle: 'C2 · 다층 감시',

  /** 1단계 SAR 전·후 비교 지도 (평양 인근 전차 소실) */
  sarCompareBounds: {
    sw: { lat: 38.985, lng: 125.58 },
    ne: { lat: 39.095, lng: 125.92 },
  },

  /**
   * 주 적 남하 침투 예상 축 — 광역 지도 파란 네모(남하 경로 관측 권역). 위치는 기존 시뮬 축 유지.
   */
  expectedEnemyRouteBounds: {
    sw: { lat: 38.72351, lng: 125.76433 },
    ne: { lat: 38.01209, lng: 127.3786 },
  },

  /** 광역 뷰 — 평양 SAR·남하 축·C2 포함 */
  overviewBounds: {
    sw: { lat: 36.95, lng: 124.82 },
    ne: { lat: 39.52, lng: 127.68 },
  },
  /** 카카오맵: 레벨이 클수록 도면이 더 상세(1=광역 ~ 14=최대 확대) — 낮출수록 더 광역 */
  overviewMapLevel: 7,

  /** 적 침공 시뮬 종료 지점(남한 측, DMZ 인근 가상) — OSRM 실패 시 직선 보간 */
  invasionTarget: { lat: 37.792, lng: 126.982 },

  /**
   * 전술 대치 — 침투·C2 축을 확대(서해~동측 전방 부대까지 포함)
   */
  insetBounds: {
    sw: { lat: 37.66, lng: 126.72 },
    ne: { lat: 38.27, lng: 127.4 },
  },
  insetMapLevel: 10,

  /** 전술 PiP(40km 이내): 높은 레벨 = 더 확대된 타일(광역 insetMapLevel:3 대비) */
  insetPipMapLevel: 10,

  /** SAR 변화분석 — 평양 인근 전차 신호 소실 의심 (광역 지도 원) */
  sarTankLossZones: [
    {
      id: 'sar-pyongyang',
      lat: BATTALION_PYONGYANG_INVASION_ORIGIN.lat,
      lng: BATTALION_PYONGYANG_INVASION_ORIGIN.lng,
      radiusM: 8200,
      label: '평양 — 적 사라짐 · SAR 신호 소실',
      labelHtml:
        '<span class="sar-tank-loss-label__city">평양</span><span class="sar-tank-loss-label__msg">적 사라짐 · 위성 SAR 신호 소실</span>',
    },
  ],
} as const

/** 휴전선(북위 38°) — 적 시뮬 위도와 비교 */
export const DMZ_PARALLEL_38_N = 38

/**
 * 적 표적이 북위 38° 부근(약 ±14km)에 있으면 true — 남하 시 ‘38선 접근’ 표시용
 */
export function isEnemyNearDmz38(lat: number): boolean {
  const delta = Math.abs(lat - DMZ_PARALLEL_38_N)
  return delta <= 0.125
}

export function isBattalionC2Unit(unit: { name: string }): boolean {
  return unit.name.includes('지휘통제실')
}

/** 적–지휘통제실 거리 표시용 (첫 번째 접촉 표적 우선) */
export function pickPrimaryEnemyForDistance<T extends { id: number; threatLevel: string }>(
  enemies: T[],
): T | undefined {
  if (enemies.length === 0) return undefined
  const rank: Record<string, number> = { 높음: 0, 중간: 1, 낮음: 2 }
  return [...enemies].sort((a, b) => (rank[a.threatLevel] ?? 9) - (rank[b.threatLevel] ?? 9))[0]
}
