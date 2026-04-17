/**
 * 드론 근접 정찰 MVP — mock (UAV 확인 이후 저고도 자산)
 */

export type DroneMissionStatus = 'idle' | 'transit' | 'close_recon' | 'returning'

export type DroneMovementState = '저고도 접근' | '목표 상공 호버' | '횡단 패스' | '귀환(저속)'

export type DroneThreatLevel = '낮음' | '중간' | '높음' | '미평가'

export type DroneMvpSnapshot = {
  droneId: string
  missionStatus: DroneMissionStatus
  afterUavContextLine: string
  mediaKind: 'video' | 'image'
  mediaUrl: string
  mediaCaption: string
  targetClass: string
  headingDegEst: number
  speedKphEst: number
  movementState: DroneMovementState
  threatLevel: DroneThreatLevel
  lat: number
  lng: number
  mgrs: string
  /** 드론 ↔ 최근접 적 MBT 거리(km) */
  distanceToNearestEnemyKm: number | null
  /** `DRONE_ENEMY_IDENTIFICATION_RANGE_KM` 등 정책 한계 */
  identificationRangeKm: number
  /** 거리 한계 이내일 때만 EO/IR로 종류·위협 판별 */
  enemyIdentified: boolean
}

export const DRONE_MVP_PLATFORM = {
  droneId: 'R-12 · Hornet-Q',
  afterUavContextLine:
    'UAV-07 광역 EO/IR 확인 후 동일 표적에 대한 저고도·근거리 EO 스트립 — APC/MBT 윤곽·열특성 근접 관측',
  mediaKind: 'video' as const,
  mediaUrl: '/media/uav/yolo-tank-3.mp4',
  mediaCaption: '근접 정찰(저고도 · 좁은 시야)',
  targetClass: 'MBT 유사(전차) · APC 혼재 구역 배제',
  threatLevel: '중간' as DroneThreatLevel,
}

export function deriveDroneMissionStatus(
  pathLength: number,
  pathIndex: number,
  running: boolean,
  phaseAllowsDrone: boolean,
): DroneMissionStatus {
  if (!phaseAllowsDrone) return 'idle'
  if (!running) return pathLength > 0 ? 'returning' : 'idle'
  if (pathLength <= 1) return 'close_recon'
  const i = ((pathIndex % pathLength) + pathLength) % pathLength
  const third = Math.max(1, Math.ceil(pathLength / 3))
  if (i < third) return 'transit'
  if (i < third * 2) return 'close_recon'
  return 'returning'
}

export function droneMissionStatusLabelKo(s: DroneMissionStatus): string {
  const m: Record<DroneMissionStatus, string> = {
    idle: '대기 (idle)',
    transit: '전개·접근 (transit)',
    close_recon: '근접 정찰 (close recon)',
    returning: '귀환 (returning)',
  }
  return m[s]
}

export function movementStateForDroneIndex(pathIndex: number): DroneMovementState {
  const cycle: DroneMovementState[] = ['저고도 접근', '목표 상공 호버', '횡단 패스', '귀환(저속)']
  return cycle[pathIndex % cycle.length]!
}
