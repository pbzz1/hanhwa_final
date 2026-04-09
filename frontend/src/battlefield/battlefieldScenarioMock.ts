import {
  BattlefieldScenarioPhase,
  type BattlefieldScenarioPhase as Phase,
} from './battlefieldScenarioPhase'

/** 우측 패널 — 단계별 고정 카피(더미) */
export type BattlefieldPhasePanelCopy = {
  title: string
  description: string
  recommendedSensor: string
  recommendDetail: string
  mapHint?: string
}

export const BATTLEFIELD_PHASE_PANEL: Record<Phase, BattlefieldPhasePanelCopy> = {
  [BattlefieldScenarioPhase.IDLE]: {
    title: '대기 · 작전 구역 미선택',
    description:
      '지도에서 한반도 작전 구역(대략 한반도 본토) 빈 곳을 클릭하거나, 아래 버튼으로 구역을 확정하세요.',
    recommendedSensor: '광역 상황 인지',
    recommendDetail: '우선 작전 구역을 확정한 뒤 SAR 광역 스캔으로 전환합니다.',
    mapHint: '적·아군 마커가 아닌 해상/육상 빈 곳을 클릭하면 구역이 선택됩니다.',
  },
  [BattlefieldScenarioPhase.REGION_SELECTED]: {
    title: '작전 구역 확정',
    description:
      '함흥 축선 등 동부 관심 구역으로 시야를 맞춘 뒤 SAR 전개를 시작하세요. SAR 버튼 또는 적 마커 클릭으로 스캔 단계로 들어갈 수 있습니다.',
    recommendedSensor: 'SAR 광역 관측',
    recommendDetail: '위성 링크 이상 시 SAR-2 예비 광역 채널로 전환하는 시뮬레이션입니다.',
    mapHint: '「SAR 전개」 버튼 또는 지도의 적 표적을 클릭해 SAR_SCAN으로 진입합니다.',
  },
  [BattlefieldScenarioPhase.SAR_SCAN]: {
    title: 'SAR 광역 스캔',
    description:
      '붉은 IW/SAR-2 관측 구역에서 이동 표적 후보를 수집합니다. 한반도 가로 폭의 SAR GRD(샘플) 직사각형 오버레이로 남하 예상 광역을 표시합니다. 구역 클릭 시 Spotlight·확률 패널이 뜹니다.',
    recommendedSensor: 'SAR-2 광역',
    recommendDetail: '후보 확정 후 UAV로 EO/IR 확인 단계로 넘깁니다.',
    mapHint:
      '파란 면은 GRD 변화(이동) 검출 픽셀(더미)입니다. 호버 시 분류·신뢰도·거리를 보여 주며, SAR/UAV 거점이 가까우면 UAV·드론 버튼이 켜집니다.',
  },
  [BattlefieldScenarioPhase.UAV_DISPATCHED]: {
    title: 'UAV 출동 · EO/IR 확인',
    description:
      'SAR 후보 좌표로 UAV 경로가 활성화됩니다(더미). 표적 확인 후 드론 근접 정찰로 이어집니다.',
    recommendedSensor: 'UAV (EO/IR)',
    recommendDetail: '영상 트랙·식별 결과는 샘플 데이터로 시뮬레이션됩니다.',
    mapHint: '드론 버튼을 눌러 근접 정찰 단계로 전환하세요.',
  },
  [BattlefieldScenarioPhase.DRONE_RECON]: {
    title: '드론 근접 정찰',
    description:
      '근거리 센서로 MBT/APC 구분·위협도를 재평가합니다(더미). 이후 FMCW로 접근·위험구역을 분석합니다.',
    recommendedSensor: '근접 EO',
    recommendDetail: '드론은 UAV보다 좁은 반경·고해상도 가정을 UI에 반영합니다.',
    mapHint: 'FMCW 레이더 버튼으로 위험분석 단계로 이동합니다.',
  },
  [BattlefieldScenarioPhase.FMCW_ANALYSIS]: {
    title: 'FMCW 위험 분석',
    description:
      '접근 속도·예상 진입축·타격 가능성을 BEV/보고서 형태로 요약합니다(더미). 완료 시 결과 패널을 띄웁니다.',
    recommendedSensor: 'FMCW 레이더',
    recommendDetail: '아군 화력·차단선과의 관계는 점수 기반 더미입니다.',
    mapHint: '「시나리오 완료」로 전체 흐름을 마감합니다.',
  },
  [BattlefieldScenarioPhase.SCENARIO_COMPLETE]: {
    title: '시나리오 완료',
    description:
      '탐지(SAR) → 확인(UAV) → 근접(드론) → 위험분석(FMCW) 흐름이 종료되었습니다. 아래는 더미 요약입니다.',
    recommendedSensor: '통합 상황판',
    recommendDetail: '실제 AI 연동 시 단계별 로그·신뢰도가 치환됩니다.',
  },
}

/** 단계별 지도 오버레이(간단 플래그) */
export const BATTLEFIELD_PHASE_MAP_FLAGS: Record<
  Phase,
  {
    sar2Zone: boolean
    enemyRoute: boolean
    showFmcwRiskFootprint: boolean
    /** 한반도 가로 폭 SAR GRD(샘플 이미지) 직사각형 오버레이 */
    showSarGrdPeninsulaOverlay: boolean
  }
> = {
  [BattlefieldScenarioPhase.IDLE]: {
    sar2Zone: false,
    enemyRoute: false,
    showFmcwRiskFootprint: false,
    showSarGrdPeninsulaOverlay: false,
  },
  [BattlefieldScenarioPhase.REGION_SELECTED]: {
    sar2Zone: false,
    enemyRoute: false,
    showFmcwRiskFootprint: false,
    showSarGrdPeninsulaOverlay: false,
  },
  [BattlefieldScenarioPhase.SAR_SCAN]: {
    sar2Zone: true,
    enemyRoute: true,
    showFmcwRiskFootprint: false,
    showSarGrdPeninsulaOverlay: true,
  },
  [BattlefieldScenarioPhase.UAV_DISPATCHED]: {
    sar2Zone: true,
    enemyRoute: true,
    showFmcwRiskFootprint: false,
    showSarGrdPeninsulaOverlay: true,
  },
  [BattlefieldScenarioPhase.DRONE_RECON]: {
    sar2Zone: true,
    enemyRoute: true,
    showFmcwRiskFootprint: false,
    showSarGrdPeninsulaOverlay: true,
  },
  [BattlefieldScenarioPhase.FMCW_ANALYSIS]: {
    sar2Zone: true,
    enemyRoute: true,
    showFmcwRiskFootprint: true,
    showSarGrdPeninsulaOverlay: true,
  },
  [BattlefieldScenarioPhase.SCENARIO_COMPLETE]: {
    sar2Zone: true,
    enemyRoute: true,
    showFmcwRiskFootprint: true,
    showSarGrdPeninsulaOverlay: true,
  },
}

export {
  GRD_DISPATCH_RANGE_KM,
  GRD_FALLBACK_SAR_UAV_ORIGIN,
  GRD_MOTION_DETECTIONS_GEOJSON,
  GRD_MOTION_META,
} from './sarMvp'

export const BATTLEFIELD_SCENARIO_NOTICES = {
  regionSelected: '작전 구역이 선택되었습니다. SAR 전개를 진행하세요.',
  enterSarScan: '함흥 방향 SAR 위성 링크 이상 감지. SAR-2 광역 관측으로 전환합니다.',
  uavDispatched: 'UAV-07이 SAR 후보 격자로 출동했습니다. (더미)',
  droneRecon: '드론 R-12가 근접 호버링을 시작했습니다. (더미)',
  fmcwAnalysis: 'FMCW 위험 윤곽 스캔을 수행 중입니다. (더미)',
  scenarioComplete: '시나리오 단계가 모두 완료되었습니다.',
} as const

/** 시나리오 완료 시 패널용 더미 요약 줄 */
export const BATTLEFIELD_SCENARIO_SUMMARY_BULLETS: readonly string[] = [
  'SAR-2: 이동 표적 후보 4건, 고신뢰 2건 (더미)',
  'UAV: EO/IR 전차 유사 3건 확인 (더미)',
  '드론: MBT 2 / 의심 APC 1, 위협도 재평가 완료 (더미)',
  'FMCW: 위험구역 반경 4.2km, 아군 타격 적합 71% (더미)',
]

/** 팝업·상세에 붙이는 단계 문맥(소속별) */
export function getEntityPhasePopupNote(
  phase: Phase,
  relation: 'ENEMY' | 'ALLY' | 'NEUTRAL',
): string {
  const table: Record<Phase, Record<typeof relation, string>> = {
    IDLE: {
      ENEMY: '[단계: 대기] 접촉 전 관찰 대상입니다.',
      ALLY: '[단계: 대기] 우군 표시만 활성입니다.',
      NEUTRAL: '[단계: 대기] 중립 이동체로 분류됩니다.',
    },
    REGION_SELECTED: {
      ENEMY: '[단계: 구역 확정] SAR 전개 우선 표적 후보입니다.',
      ALLY: '[단계: 구역 확정] 연동 감시 자산입니다.',
      NEUTRAL: '[단계: 구역 확정] 민간 이동 구분 유지.',
    },
    SAR_SCAN: {
      ENEMY: '[단계: SAR] 광역 IW 내 이동 에너지 후보로 추적 중.',
      ALLY: '[단계: SAR] 아군 필터 적용(더미).',
      NEUTRAL: '[단계: SAR] 배경 클러터 억제 적용(더미).',
    },
    UAV_DISPATCHED: {
      ENEMY: '[단계: UAV] EO/IR 클로즈업 식별 큐 대기.',
      ALLY: '[단계: UAV] 공역 분리·회피 권고(더미).',
      NEUTRAL: '[단계: UAV] 민간 항로와의 분리 확인(더미).',
    },
    DRONE_RECON: {
      ENEMY: '[단계: 드론] 근접 스펙 추정·위협도 갱신.',
      ALLY: '[단계: 드론] 근접 비행 제한 구역(더미).',
      NEUTRAL: '[단계: 드론] 민간 근접 회피(더미).',
    },
    FMCW_ANALYSIS: {
      ENEMY: '[단계: FMCW] 접근 속도·진입축 위험도 산출.',
      ALLY: '[단계: FMCW] 타격 판단 보조(더미).',
      NEUTRAL: '[단계: FMCW] 비교전 참고(더미).',
    },
    SCENARIO_COMPLETE: {
      ENEMY: '[단계: 완료] 시나리오 로그에 편입됨.',
      ALLY: '[단계: 완료] 보고서 첨부 완료(더미).',
      NEUTRAL: '[단계: 완료] 민간 구분 유지.',
    },
  }
  return table[phase][relation]
}

export function getFriendlyAssetPhaseNote(phase: Phase, category: string): string {
  const base = `[단계: ${phase}] `
  if (phase === BattlefieldScenarioPhase.IDLE) return `${base}일반 표시.`
  if (phase === BattlefieldScenarioPhase.REGION_SELECTED) return `${base}작전 구역 내 아군 자산.`
  if (phase === BattlefieldScenarioPhase.SAR_SCAN) return `${base}SAR 스캔 시 전자적 노출 최소화(더미).`
  if (phase === BattlefieldScenarioPhase.UAV_DISPATCHED) return `${base}UAV와 데이터링크 동기화(더미).`
  if (phase === BattlefieldScenarioPhase.DRONE_RECON) return `${base}드론 호출 가능 거리 내 배치(더미).`
  if (phase === BattlefieldScenarioPhase.FMCW_ANALYSIS) {
    return `${base}FMCW 커버리지·화력 연동 점검(더미) · 분류 ${category}.`
  }
  return `${base}임무 종료 보고 대기.`
}

/** 우측 패널 선택 객체 하단에 붙는 한 줄 */
export function getSelectedDetailPhaseLine(
  phase: Phase,
  affiliation: '적' | '아군' | '우군' | '중립',
): string {
  if (affiliation === '적') {
    const rel = 'ENEMY' as const
    return getEntityPhasePopupNote(phase, rel)
  }
  if (affiliation === '우군') return getEntityPhasePopupNote(phase, 'ALLY')
  if (affiliation === '중립') return getEntityPhasePopupNote(phase, 'NEUTRAL')
  return getFriendlyAssetPhaseNote(phase, '아군')
}
