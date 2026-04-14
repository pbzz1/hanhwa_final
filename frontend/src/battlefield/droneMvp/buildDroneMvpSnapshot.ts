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
  /** 근접 임무 중 드론 클릭 시 EO/IR·표적 검출 영상·식별 UI 강제 */
  forceEoIrFeed?: boolean
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
  let enemyIdentified = dist != null && dist <= range

  const distHint =
    dist != null
      ? `최근접 적 MBT 약 ${dist.toFixed(0)} km · 식별 한계 ${range} km`
      : `적 MBT 좌표 없음 · 식별 한계 ${range} km`

  if (input.forceEoIrFeed) {
    enemyIdentified = true
  }

  const snap: DroneMvpSnapshot = {
    droneId: DRONE_MVP_PLATFORM.droneId,
    missionStatus,
    afterUavContextLine: enemyIdentified
      ? input.forceEoIrFeed
        ? '지정 적 표적을 향해 저고도 근접 중 — EO/IR·표적 검출 스트림.'
        : DRONE_MVP_PLATFORM.afterUavContextLine
      : `거리 게이트: 드론–적 MBT ≤ ${range} km 일 때만 EO/IR 표적 판별. (${distHint})`,
    mediaKind: DRONE_MVP_PLATFORM.mediaKind,
    mediaUrl: enemyIdentified ? DRONE_MVP_PLATFORM.mediaUrl : '',
    mediaCaption: enemyIdentified
      ? input.forceEoIrFeed
        ? '표적 검출 영상'
        : DRONE_MVP_PLATFORM.mediaCaption
      : `EO/IR 영상·분류는 거리 ≤ ${range} km 일 때만 표시.`,
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
  return snap
}
