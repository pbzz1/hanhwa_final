import type { RiskCandidateE2E, RiskScoreMode } from '../types/risk'
import { RISK_LABEL_KO } from './riskStyle'

export function riskScoreByMode(row: RiskCandidateE2E, mode: RiskScoreMode): number {
  switch (mode) {
    case 'rule':
      return row.riskScoreRule
    case 'ml':
      return row.riskScoreMl
    case 'hybrid':
      return row.riskScoreHybrid
    case 'final':
    default:
      return row.finalRiskScore
  }
}

export function riskLabelKoFromRow(row: RiskCandidateE2E): string {
  return RISK_LABEL_KO[row.riskLabelFinal]
}

export function formatRiskScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(3) : '-'
}
