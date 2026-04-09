import {
  type UavMvpSnapshot,
  UAV_MVP_PLATFORM,
  deriveUavOperationalStatus,
} from './uavMockData'

export function buildUavMvpSnapshot(input: {
  lat: number
  lng: number
  mgrs: string
  pathLength: number
  pathIndex: number
  running: boolean
  phaseAtLeastUav: boolean
}): UavMvpSnapshot {
  const opsStatus = deriveUavOperationalStatus(
    input.pathLength,
    input.pathIndex,
    input.running,
    input.phaseAtLeastUav,
  )

  const jitter = (input.pathIndex % 5) * 0.4
  const speedKphEst = 115 + jitter
  const headingDegEst = 202 + (input.pathIndex % 3) * 2

  return {
    callSign: UAV_MVP_PLATFORM.callSign,
    platformId: UAV_MVP_PLATFORM.platformId,
    opsStatus,
    hasEoIr: true,
    eoIrNote: UAV_MVP_PLATFORM.eoIrNote,
    sarFollowupLine: UAV_MVP_PLATFORM.sarFollowupLine,
    mediaKind: UAV_MVP_PLATFORM.mediaKind,
    mediaUrl: UAV_MVP_PLATFORM.mediaUrl,
    mediaCaption: UAV_MVP_PLATFORM.mediaCaption,
    tankIdentification: UAV_MVP_PLATFORM.tankIdentification,
    identificationConfidence: UAV_MVP_PLATFORM.identificationConfidence,
    lat: input.lat,
    lng: input.lng,
    speedKphEst,
    headingDegEst,
    mgrs: input.mgrs,
    tankSpecLine: UAV_MVP_PLATFORM.tankSpecLine,
    tankSpecDetail: UAV_MVP_PLATFORM.tankSpecDetail,
  }
}
