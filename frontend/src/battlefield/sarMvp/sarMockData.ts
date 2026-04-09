/**
 * SAR MVP — mock 수치·문구·단계 정의 (실 API 없을 때)
 */

export type SarPassProbability = {
  label: string
  probability: number
}

export const SAR_ZONE_PASS_PROBABILITIES: readonly SarPassProbability[] = [
  { label: '전차 A군 통과 확률', probability: 0.99 },
  { label: '전차 B군 통과 확률', probability: 0.88 },
  { label: '전차 C군 통과 확률', probability: 0.8 },
  { label: 'APC 혼재 가능성', probability: 0.47 },
]

export type SarMvpRevealStepId = 'prep' | 'motion' | 'objects'

export const SAR_MVP_REVEAL_SEQUENCE: ReadonlyArray<{
  id: SarMvpRevealStepId
  title: string
  description: string
}> = [
  {
    id: 'prep',
    title: '1. SAR 원본 · 전처리',
    description: '관측창 전처리 샘플 오버레이',
  },
  {
    id: 'motion',
    title: '2. 이동 픽셀 후보',
    description: '변화검출 기반 이동 에너지 클러스터(파란 면)',
  },
  {
    id: 'objects',
    title: '3. 지도상 후보 객체',
    description: '격자·경로와 연계한 표적 후보(적 마커 강조)',
  },
]

export const SAR_SPOTLIGHT_MODAL_SUB =
  '관측 구역 클릭 — Spotlight 강조 · 통과 확률 패널(더미)'
