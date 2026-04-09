/** 전장 시나리오 단계(상태 머신) — UI·지도·패널에서 공통 참조 */

export const BattlefieldScenarioPhase = {
  IDLE: 'IDLE',
  REGION_SELECTED: 'REGION_SELECTED',
  SAR_SCAN: 'SAR_SCAN',
  UAV_DISPATCHED: 'UAV_DISPATCHED',
  DRONE_RECON: 'DRONE_RECON',
  FMCW_ANALYSIS: 'FMCW_ANALYSIS',
  SCENARIO_COMPLETE: 'SCENARIO_COMPLETE',
} as const

export type BattlefieldScenarioPhase =
  (typeof BattlefieldScenarioPhase)[keyof typeof BattlefieldScenarioPhase]

export const BATTLEFIELD_PHASE_SEQUENCE: readonly BattlefieldScenarioPhase[] = [
  BattlefieldScenarioPhase.IDLE,
  BattlefieldScenarioPhase.REGION_SELECTED,
  BattlefieldScenarioPhase.SAR_SCAN,
  BattlefieldScenarioPhase.UAV_DISPATCHED,
  BattlefieldScenarioPhase.DRONE_RECON,
  BattlefieldScenarioPhase.FMCW_ANALYSIS,
  BattlefieldScenarioPhase.SCENARIO_COMPLETE,
] as const

export type BattlefieldSensorId = 'sar' | 'uav' | 'drone' | 'fmcw'

export function indexOfBattlefieldPhase(phase: BattlefieldScenarioPhase): number {
  return BATTLEFIELD_PHASE_SEQUENCE.indexOf(phase)
}

export function shiftBattlefieldPhase(
  phase: BattlefieldScenarioPhase,
  delta: -1 | 1,
): BattlefieldScenarioPhase {
  const i = indexOfBattlefieldPhase(phase)
  const next = Math.max(0, Math.min(BATTLEFIELD_PHASE_SEQUENCE.length - 1, i + delta))
  return BATTLEFIELD_PHASE_SEQUENCE[next]!
}

export function phaseAtLeast(
  current: BattlefieldScenarioPhase,
  minimum: BattlefieldScenarioPhase,
): boolean {
  return indexOfBattlefieldPhase(current) >= indexOfBattlefieldPhase(minimum)
}

/** 센서 버튼으로 허용되는 다음 단계 전환(순서 준수) */
export function tryAdvancePhaseWithSensor(
  phase: BattlefieldScenarioPhase,
  sensor: BattlefieldSensorId,
): BattlefieldScenarioPhase | null {
  if (phase === BattlefieldScenarioPhase.REGION_SELECTED && sensor === 'sar') {
    return BattlefieldScenarioPhase.SAR_SCAN
  }
  if (phase === BattlefieldScenarioPhase.SAR_SCAN && sensor === 'uav') {
    return BattlefieldScenarioPhase.UAV_DISPATCHED
  }
  if (phase === BattlefieldScenarioPhase.UAV_DISPATCHED && sensor === 'drone') {
    return BattlefieldScenarioPhase.DRONE_RECON
  }
  if (phase === BattlefieldScenarioPhase.DRONE_RECON && sensor === 'fmcw') {
    return BattlefieldScenarioPhase.FMCW_ANALYSIS
  }
  return null
}

/** 한반도 작전 구역(대략적 bbox) — IDLE에서 빈 지도 클릭 시 REGION_SELECTED */
export const KOREA_OPS_BOUNDS = {
  south: 33.9,
  north: 38.9,
  west: 124.5,
  east: 131.5,
} as const

export function isInsideKoreaOpsRegion(lat: number, lng: number): boolean {
  return (
    lat >= KOREA_OPS_BOUNDS.south &&
    lat <= KOREA_OPS_BOUNDS.north &&
    lng >= KOREA_OPS_BOUNDS.west &&
    lng <= KOREA_OPS_BOUNDS.east
  )
}
