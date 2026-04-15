import type { RiskLabel, RiskScoreMode } from '../types/risk'

export const RISK_LABEL_KO: Record<RiskLabel, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
}

export const RISK_LABEL_COLOR: Record<RiskLabel, string> = {
  low: '#facc15',
  medium: '#f97316',
  high: '#ef4444',
}

export const RISK_LABEL_FILL_COLOR: Record<RiskLabel, string> = {
  low: 'rgba(250,204,21,0.18)',
  medium: 'rgba(249,115,22,0.22)',
  high: 'rgba(239,68,68,0.24)',
}

export const RISK_SCORE_MODE_LABEL: Record<RiskScoreMode, string> = {
  rule: 'Rule',
  ml: 'ML',
  hybrid: 'Hybrid',
  final: 'Final',
}
