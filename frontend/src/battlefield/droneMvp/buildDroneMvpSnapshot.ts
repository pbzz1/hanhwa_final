import {
  type DroneMvpSnapshot,
  DRONE_MVP_PLATFORM,
  deriveDroneMissionStatus,
  movementStateForDroneIndex,
} from './droneMockData'

export function buildDroneMvpSnapshot(input: {
  lat: number
  lng: number
  mgrs: string
  pathLength: number
  pathIndex: number
  running: boolean
  phaseAtLeastDrone: boolean
  distanceToNearestEnemyKm: number | null
  identificationRangeKm: number
}): DroneMvpSnapshot {
  const missionStatus = deriveDroneMissionStatus(
    input.pathLength,
    input.pathIndex,
    input.running,
    input.phaseAtLeastDrone,
  )

  const jitter = (input.pathIndex % 4) * 0.35
  const speedKphEst = 42 + jitter
  const headingDegEst = 198 + (input.pathIndex % 5) * 1.2

  const dist = input.distanceToNearestEnemyKm
  const range = input.identificationRangeKm
  const enemyIdentified = dist != null && dist <= range

  const distHint =
    dist != null
      ? `최근접 적 MBT 약 ${dist.toFixed(0)} km · 식별 한계 ${range} km`
      : `적 MBT 좌표 없음 · 식별 한계 ${range} km`

  return {
    droneId: DRONE_MVP_PLATFORM.droneId,
    missionStatus,
    afterUavContextLine: enemyIdentified
      ? DRONE_MVP_PLATFORM.afterUavContextLine
      : `거리 게이트: 드론–적 MBT ≤ ${range} km 일 때만 EO/IR 표적 판별. (${distHint})`,
    mediaKind: DRONE_MVP_PLATFORM.mediaKind,
    mediaUrl: enemyIdentified ? DRONE_MVP_PLATFORM.mediaUrl : '',
    mediaCaption: enemyIdentified
      ? DRONE_MVP_PLATFORM.mediaCaption
      : `EO/IR 영상·분류는 거리 ≤ ${range} km 일 때만 표시(시연 규칙).`,
    targetClass: enemyIdentified ? DRONE_MVP_PLATFORM.targetClass : `미식별 (${distHint})`,
    headingDegEst,
    speedKphEst,
    movementState: movementStateForDroneIndex(input.pathIndex),
    threatLevel: enemyIdentified ? DRONE_MVP_PLATFORM.threatLevel : '미평가',
    lat: input.lat,
    lng: input.lng,
    mgrs: input.mgrs,
    distanceToNearestEnemyKm: dist,
    identificationRangeKm: range,
    enemyIdentified,
  }
}
