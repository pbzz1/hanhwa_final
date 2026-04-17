/**
 * UAV MVP — mock 플랫폼·식별·스펙 (실데이터 없을 때)
 */

export type UavOperationalStatus = 'idle' | 'dispatched' | 'tracking' | 'returning'

export type UavMvpSnapshot = {
  callSign: string
  platformId: string
  opsStatus: UavOperationalStatus
  hasEoIr: boolean
  eoIrNote: string
  sarFollowupLine: string
  mediaKind: 'video' | 'image'
  mediaUrl: string
  mediaCaption: string
  tankIdentification: string
  identificationConfidence: string
  lat: number
  lng: number
  speedKphEst: number
  headingDegEst: number
  mgrs: string
  tankSpecLine: string
  tankSpecDetail: string
}

export const UAV_MVP_PLATFORM = {
  callSign: 'UAV-07 · Ghosteye',
  platformId: 'MQ-9A-급',
  eoIrNote: 'EO: 1080p30 · IR: MWIR 640×512, 디지털 줌 4×',
  sarFollowupLine:
    'SAR-2 광역 후보 격자(함흥 남하 축)에 대한 2차 확인 자산 — GRD 변화 셀과 동일 타깃 우선 관측',
  mediaKind: 'video' as const,
  mediaUrl: '/media/uav/yolo-tank-2.mp4',
  mediaCaption: 'EO/IR 클립(전차 유사 목표 추적)',
  tankIdentification: 'MBT 유사 · T-72 계열',
  identificationConfidence: '신뢰도 0.82 (EO/IR 융합)',
  tankSpecLine: '추정 전차 스펙',
  tankSpecDetail:
    '전장 9.5m급 · 포탑 전후 2축 안정화 가정 · 적외 열시그니처 고온(엔진·배기) 패턴 일치',
}

/** 경로 진행률로 임무 단계(mock) */
export function deriveUavOperationalStatus(
  pathLength: number,
  pathIndex: number,
  running: boolean,
  phaseAllowsUav: boolean,
): UavOperationalStatus {
  if (!phaseAllowsUav) return 'idle'
  if (!running) return pathLength > 0 ? 'returning' : 'idle'
  if (pathLength <= 1) return 'tracking'
  const i = ((pathIndex % pathLength) + pathLength) % pathLength
  const third = Math.max(1, Math.ceil(pathLength / 3))
  if (i < third) return 'dispatched'
  if (i < third * 2) return 'tracking'
  return 'returning'
}

export function uavOpsStatusLabelKo(s: UavOperationalStatus): string {
  const m: Record<UavOperationalStatus, string> = {
    idle: '대기 (idle)',
    dispatched: '출동 (dispatched)',
    tracking: '추적 (tracking)',
    returning: '귀환 (returning)',
  }
  return m[s]
}
