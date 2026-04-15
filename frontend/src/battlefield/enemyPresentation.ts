/**
 * 적 표적 라벨 — 센서/C2 UI 톤(추정·Track ID·탐지 상태) 통일.
 * 지도·팝업·GeoJSON 속성 생성 시 이 모듈만 사용하는 것을 권장합니다.
 */

export type EnemyCategory =
  | 'armored_brigade'
  | 'mechanized_corps'
  | 'artillery_position'
  | 'command_post'
  | 'troop_assembly'
  | 'logistics_facility'
  | 'armored_assembly'
  | 'armored_battalion'
  | 'mechanized_battalion'
  | 'grd_motion_cluster'
  | 'unknown'

export type DetectionStatus = 'detected' | 'identified' | 'tracking'

export type DetectionConfidence = 'suspected' | 'assessed' | 'confirmed'

export const ENEMY_CATEGORY_LABELS: Record<EnemyCategory, string> = {
  armored_brigade: '적 기갑여단',
  mechanized_corps: '적 기계화보병군단',
  artillery_position: '적 포병진지',
  command_post: '적 지휘소',
  troop_assembly: '적 병력집결지',
  logistics_facility: '적 군수지원시설',
  armored_assembly: '적 기갑집결지',
  armored_battalion: '적 기갑대대',
  mechanized_battalion: '적 기계화보병대대',
  grd_motion_cluster: '적 GRD 변화표적',
  unknown: '적 미상표적',
}

export function getEnemyDisplayName(
  category: EnemyCategory | undefined,
  confidence?: DetectionConfidence,
): string {
  const cat: EnemyCategory =
    category != null && ENEMY_CATEGORY_LABELS[category] != null ? category : 'unknown'
  const base = ENEMY_CATEGORY_LABELS[cat]
  if (confidence === 'confirmed') return base
  return `${base}(추정)`
}

export function getEnemyStatusLabel(status: DetectionStatus | undefined): string {
  switch (status) {
    case 'identified':
      return '식별'
    case 'tracking':
      return '추적 중'
    case 'detected':
    default:
      return '탐지'
  }
}

export function getTrackLabelLong(trackId: string): string {
  const t = trackId.trim()
  return t.length > 0 ? `Track ID: ${t}` : 'Track ID: —'
}

export function formatEnemyTrkShort(trackId: string): string {
  const t = trackId.trim()
  return t.length > 0 ? `TRK-${t}` : 'TRK-—'
}

/** 표시용 Track 번호(숫자). trackId 미설정 시 unitCode(E4xxxx) 또는 entity id에서 유도 */
export function resolveScenarioEnemyTrackDigits(entity: {
  id: number
  trackId?: string
  unitCode?: string
}): string {
  const raw = typeof entity.trackId === 'string' ? entity.trackId.trim() : ''
  if (raw.length > 0) return raw
  const uc = typeof entity.unitCode === 'string' ? entity.unitCode.trim() : ''
  const m = /^E\d+(\d{4})$/.exec(uc)
  if (m) return m[1]!
  return String(Math.abs(entity.id) % 10000).padStart(4, '0')
}

export type ScenarioEntityLabelSource = {
  id: number
  relation: 'ENEMY' | 'ALLY' | 'NEUTRAL'
  name: string
  enemyCategory?: EnemyCategory
  detectionStatus?: DetectionStatus
  confidence?: DetectionConfidence
  trackId?: string
  unitCode?: string
}

function enemyLabelParts(entity: ScenarioEntityLabelSource): {
  display: string
  status: string
  track: string
} {
  const track = resolveScenarioEnemyTrackDigits(entity)
  return {
    display: getEnemyDisplayName(entity.enemyCategory, entity.confidence),
    status: getEnemyStatusLabel(entity.detectionStatus),
    track,
  }
}

/** 지도·툴팁용 다줄 라벨 (적 전용) */
export function formatScenarioEnemyMultiLine(entity: ScenarioEntityLabelSource): string {
  const { display, status, track } = enemyLabelParts(entity)
  return [display, `상태: ${status}`, getTrackLabelLong(track)].join('\n')
}

/** 지도 축소 시 compact 한 줄 */
export function formatScenarioEnemyCompact(entity: ScenarioEntityLabelSource): string {
  const { display, status, track } = enemyLabelParts(entity)
  return `${display} | ${status} | ${formatEnemyTrkShort(track)}`
}

/** 우군/중립 지도 라벨 */
export function formatScenarioNonEnemyMapMultiLine(name: string, unitCode: string): string {
  return `${name}\n식별번호 ${unitCode}`
}

export function formatScenarioNonEnemyMapCompact(name: string, unitCode: string): string {
  return `${name} | ${unitCode}`
}

export function buildScenarioMapLabels(
  entity: ScenarioEntityLabelSource,
  unitCode: string,
): {
  scenario_label_multi: string
  scenario_label_compact: string
  /** GeoJSON `name` 등 레거시 필드용 짧은 표기 */
  legendName: string
} {
  if (entity.relation === 'ENEMY') {
    return {
      scenario_label_multi: formatScenarioEnemyMultiLine(entity),
      scenario_label_compact: formatScenarioEnemyCompact(entity),
      legendName: formatScenarioEnemyCompact(entity),
    }
  }
  return {
    scenario_label_multi: formatScenarioNonEnemyMapMultiLine(entity.name, unitCode),
    scenario_label_compact: formatScenarioNonEnemyMapCompact(entity.name, unitCode),
    legendName: entity.name,
  }
}
