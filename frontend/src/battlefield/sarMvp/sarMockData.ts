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

export const SAR_SPOTLIGHT_MODAL_SUB =
  '관측 구역 클릭 — Spotlight 강조 · 통과 확률 패널'
