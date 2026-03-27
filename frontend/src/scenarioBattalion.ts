/**
 * 대대(지휘통제실) 압축 시나리오 — 큰 지도(SAR)·작은 지도(대치) 공통 상수
 * 아군·적 표적 모두 남한 좌표 → 시뮬 시 남하 침투(데모)
 */
export const BATTALION_SCENARIO = {
  title: '제1기갑대대 작전구역',
  subtitle: '지휘통제실 중심 전술 상황 (데모)',

  /** 광역 SAR·전장 개요 (큰 지도) — 남·북 권역 */
  overviewBounds: {
    sw: { lat: 37.62, lng: 126.52 },
    ne: { lat: 38.52, lng: 127.38 },
  },
  overviewMapLevel: 9,

  /** 적 침공 시뮬 종료 지점(남한 측, DMZ 인근 가상) — OSRM 실패 시 직선 보간 */
  invasionTarget: { lat: 37.792, lng: 126.982 },

  /** 적·아군 대치 (작은 지도) — 접촉 표적·지휘통제실 동시에 보이도록 */
  insetBounds: {
    sw: { lat: 37.72, lng: 126.52 },
    ne: { lat: 38.45, lng: 127.38 },
  },
  insetMapLevel: 4,

  /** SAR 변화분석 의심 구역 1곳만, 연한 강조 */
  sarTankLossZones: [
    {
      id: 'sar-1',
      lat: 37.94,
      lng: 126.93,
      radiusM: 2200,
      label: '전차 신호 소실 A',
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
