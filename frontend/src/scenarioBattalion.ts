/**
 * 대대(지휘통제실) 압축 시나리오 — 큰 지도(SAR)·작은 지도(대치) 공통 상수
 * 아군: 휴전선 이남 / 적: 이북 — 시뮬 남하 침공(데모)
 */

/**
 * 대대(지휘통제실) 기준 거리(데모).
 * 개념 순서: 위성 SAR → UAV SAR(40km 밖) → 펄스(40km 이내) → FMCW(15km 이내).
 */
export const SCENARIO_RANGES_KM = {
  /** 군사분계선(펄스 권역 시작) — 이보다 멀면 UAV SAR 추적 단계로 표현 */
  PULSE_MAX: 40,
  FMCW_MAX: 15,
  /** 정찰 드론 출동·현장 EO/IR 촬영(데모) — C2~주 적 거리 기준, FMCW 권과 동일 */
  DRONE_DISPATCH_MAX_KM: 15,
  PULSE_UNCERTAIN_MIN: 15,
} as const

export const BATTALION_SCENARIO = {
  title: '제1기갑대대 작전구역',
  subtitle: '지휘통제실 중심 전술 상황 (데모)',

  /** 1단계 SAR 전·후 비교 지도 (북측 전차 소실) */
  sarCompareBounds: {
    sw: { lat: 38.02, lng: 126.72 },
    ne: { lat: 38.32, lng: 127.12 },
  },

  /**
   * 광역 지도 위성 SAR 감시 네모 — 적 집결/출발 지점(시드 ~38.2, 126.92) 인근 소구역만 표시.
   * (전·후 비교용 sarCompareBounds와 별도)
   */
  overviewSarWatchBounds: {
    sw: { lat: 38.168, lng: 126.888 },
    ne: { lat: 38.232, lng: 126.952 },
  },

  /**
   * 주 적 남하 침투 예상 축 — 광역 지도 네모. 이전 대비 약 2.5배 면적(중심 유지·반경 확대).
   */
  expectedEnemyRouteBounds: {
    sw: { lat: 37.255, lng: 126.435 },
    ne: { lat: 38.805, lng: 127.385 },
  },

  /** 광역 뷰 — 확대된 expectedEnemyRouteBounds·소 SAR·C2 포함 */
  overviewBounds: {
    sw: { lat: 37.18, lng: 126.22 },
    ne: { lat: 38.88, lng: 127.62 },
  },
  /** 카카오맵: 레벨이 클수록 도면이 더 상세(1=광역 ~ 14=최대 확대) — 낮출수록 더 광역 */
  overviewMapLevel: 8,

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

  /** SAR 변화분석 — 북측 전차 신호 소실 의심 (광역 지도 원) */
  sarTankLossZones: [
    {
      id: 'sar-1',
      lat: 38.2,
      lng: 126.92,
      radiusM: 1100,
      label: '북측 전차 신호 소실 A',
    },
  ],
} as const

/** 휴전선(데모: 북위 38°) — 적 시뮬 위도와 비교 */
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
