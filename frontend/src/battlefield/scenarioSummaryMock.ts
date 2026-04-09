/**
 * 시나리오 종료 요약 — SAR→UAV→드론→FMCW 파이프라인 더미 리포트
 * (일부 수치는 런타임 FMCW·적 엔티티 수와 맞춰 자연스럽게 이어짐)
 */

export type PhaseDetectionResult = {
  stepLabel: string
  headline: string
  detail: string
}

export type ScenarioTacticFitRow = {
  name: string
  score: number
  rationale: string
}

export type AssetContributionRow = {
  label: string
  category: string
  contributionPct: number
  note: string
}

export type ScenarioSummaryReport = {
  title: string
  subtitle: string
  phaseResults: PhaseDetectionResult[]
  finalEnemyMbtCount: number
  finalEnemyMbtDetail: string
  movementPathTitle: string
  movementPathSteps: string[]
  movementPathNote: string
  dangerZoneTitle: string
  dangerZoneDetail: string
  dangerZoneFmcwLine: string
  tactics: ScenarioTacticFitRow[]
  assetContributions: AssetContributionRow[]
  strikeSuitabilityPct: number
}

export function buildScenarioSummaryReport(input: {
  enemyMbtEntityCount: number
  fmcwZoneLabel: string
  fmcwIngressSummary: string
  fmcwDetectionRangeKm: number
  fmcwStrikeCapable: number
  fmcwEngagementCount: number
}): ScenarioSummaryReport {
  const strikeSuitabilityPct =
    input.fmcwEngagementCount > 0
      ? Math.min(96, Math.max(18, Math.round((input.fmcwStrikeCapable / input.fmcwEngagementCount) * 100)))
      : 71

  const mbt = Math.max(1, input.enemyMbtEntityCount)

  const phaseResults: PhaseDetectionResult[] = [
    {
      stepLabel: 'SAR-2 광역',
      headline: '이동 에너지 후보 4건 · 고신뢰 2건',
      detail:
        '함흥 남하 축 GRD 변화 셀과 SAR-2 붉은 관측 지역이 교차한 격자를 우선 큐로 올렸습니다. (더미 파이프라인)',
    },
    {
      stepLabel: 'UAV EO/IR',
      headline: '전차 유사 3건 확인 · T-72 계열 가정 1건',
      detail:
        'UAV-07 Ghosteye가 SAR 후보 좌표에 정렬되어 EO/IR 융합 식별을 수행했습니다. 신뢰도 상위 표적은 드론 근접으로 넘겼습니다.',
    },
    {
      stepLabel: '드론 근접',
      headline: 'MBT 2 · APC 의심 1 (재분류)',
      detail:
        '저고도 스트립에서 열·윤곽 특성으로 MBT 2체를 확정, APC 후보 1건은 저신뢰로 유지했습니다. 위협도는 중간으로 재평가.',
    },
    {
      stepLabel: 'FMCW',
      headline: `위험 윤곽 스캔 · 아군 타격 적합도 ${strikeSuitabilityPct}% (더미)`,
      detail: `탐지 거리 ${input.fmcwDetectionRangeKm.toFixed(1)} km 가정, 진입축과 트랙 T01–T03을 융합했습니다.`,
    },
  ]

  const tactics: ScenarioTacticFitRow[] = [
    {
      name: '간접 화력 우선(포병)',
      score: 88,
      rationale: `위험구역이 포병 사거리와 겹치는 아군 비율이 높아, FMCW 적합도 ${strikeSuitabilityPct}%와 정합됩니다.`,
    },
    {
      name: '기갑 예비대 기동',
      score: 76,
      rationale: '남하 예측 축과 교차하는 기갑 거점이 28km 이내(더미)에 존재.',
    },
    {
      name: '전자전·억제 패키지',
      score: 64,
      rationale: 'UAV·드론이 확보한 데이터링크 시간창에 맞춘 소프트킬 옵션(더미).',
    },
  ]

  const assetContributions: AssetContributionRow[] = [
    {
      label: 'SAR-2 광역',
      category: 'SAR',
      contributionPct: 22,
      note: '광역 후보 격자·통과 확률 맵 제공',
    },
    {
      label: 'UAV-07',
      category: 'UAV',
      contributionPct: 26,
      note: 'EO/IR 식별·표적 큐 확정',
    },
    {
      label: 'R-12 드론',
      category: 'DRONE',
      contributionPct: 21,
      note: '근접 스펙·위협도 재평가',
    },
    {
      label: 'FMCW 레이더',
      category: 'FMCW',
      contributionPct: 24,
      note: '진입축·위험 윤곽·타격 판단 보조',
    },
    {
      label: 'C2 통합',
      category: 'C2',
      contributionPct: 7,
      note: '자산 스케줄·보고서 편성(더미)',
    },
  ]

  return {
    title: '시나리오 종료 · 통합 결과 요약',
    subtitle: '탐지(SAR) → 확인(UAV) → 근접(드론) → 위험분석(FMCW) 파이프라인이 완료되었습니다.',
    phaseResults,
    finalEnemyMbtCount: mbt,
    finalEnemyMbtDetail: `적 전차(MBT) 군집 ${mbt}개가 파이프라인 전 구간에서 동일 축으로 추적되었습니다. 최종 확정 전차 표적 수(더미): ${mbt}개 군집 기준.`,
    movementPathTitle: '예상 이동 경로',
    movementPathSteps: [
      '평양·함흥 집결축 → 함흥 남하(동부)',
      'SAR 적 경로(점선)와 GRD 남하 클러스터 정합',
      'FMCW 예상 진입축(주황 점선)이 위험 폴리곤 코어로 수렴',
    ],
    movementPathNote:
      '지도의 적 이동 경로 레이어·FMCW 진입축과 동일한 내러티브로 생성된 더미 요약입니다.',
    dangerZoneTitle: '위험 지역',
    dangerZoneDetail:
      '함흥 남쪽 FMCW 위험 윤곽(주황 면) 내에서 접근 속도·다중 트랙이 중첩된 구간을 핵심 위험코어로 표시했습니다.',
    dangerZoneFmcwLine: input.fmcwZoneLabel,
    tactics,
    assetContributions,
    strikeSuitabilityPct,
  }
}
