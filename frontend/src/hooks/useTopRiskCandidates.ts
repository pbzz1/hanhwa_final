import { useMemo } from 'react'
import type { RiskCandidateE2E, RiskUiState } from '../types/risk'
import { riskScoreByMode } from '../utils/riskFormat'

function topLimitByMode(mode: RiskUiState['topKMode']): number {
  if (mode === 'top5') return 5
  if (mode === 'top10') return 10
  if (mode === 'top20') return 20
  return Number.POSITIVE_INFINITY
}

function variantFromComparison(mode: RiskUiState['comparisonMode']): RiskCandidateE2E['experimentVariant'] {
  if (mode === 'none') return 'full_model'
  return mode
}

export function useTopRiskCandidates(allCandidates: RiskCandidateE2E[], riskState: RiskUiState) {
  return useMemo(() => {
    const safePipelineMode = (['full', 'ops', 'ops_t20', 'ops_t15'] as const).includes(
      riskState.pipelineMode,
    )
      ? riskState.pipelineMode
      : 'ops_t15'
    const safeAlgo = (['hdbscan', 'dbscan'] as const).includes(riskState.clusterAlgoMode)
      ? riskState.clusterAlgoMode
      : 'hdbscan'
    const safeComparison = (
      ['none', 'rule_only', 'no_lidar', 'no_tracking_features', 'no_calibration'] as const
    ).includes(riskState.comparisonMode)
      ? riskState.comparisonMode
      : 'none'
    const safeLidarMode = (['assisted', 'radar_only', 'both'] as const).includes(riskState.lidarMode)
      ? riskState.lidarMode
      : 'both'
    const safeTopMode = (['top5', 'top10', 'top20', 'all'] as const).includes(riskState.topKMode)
      ? riskState.topKMode
      : 'top5'

    const variant = variantFromComparison(safeComparison)
    const filtered = allCandidates.filter((row) => {
      if (row.pipelineMode !== safePipelineMode) return false
      if (row.algorithm !== safeAlgo) return false
      if (row.experimentVariant !== variant) return false
      if (safeLidarMode === 'assisted' && row.lidarMode !== 'assisted') return false
      if (safeLidarMode === 'radar_only' && row.lidarMode !== 'radar-only') return false
      return true
    })

    const ranked = [...filtered]
      .map((row) => ({
        row,
        modeScore: riskScoreByMode(row, riskState.riskScoreMode),
      }))
      .sort((a, b) => {
        if (b.modeScore !== a.modeScore) return b.modeScore - a.modeScore
        return a.row.rankGlobal - b.row.rankGlobal
      })
      .map((entry) => entry.row)

    const topLimit = topLimitByMode(safeTopMode)
    const topCandidates = ranked.slice(0, Number.isFinite(topLimit) ? topLimit : ranked.length)
    const displayCandidates = riskState.showAllCandidates
      ? ranked
      : riskState.showTopRiskOnly
        ? topCandidates
        : ranked

    const summary = {
      totalCount: ranked.length,
      highCount: ranked.filter((row) => row.riskLabelFinal === 'high').length,
      mediumCount: ranked.filter((row) => row.riskLabelFinal === 'medium').length,
      lowCount: ranked.filter((row) => row.riskLabelFinal === 'low').length,
      avgFinalScore:
        ranked.length > 0
          ? ranked.reduce((sum, row) => sum + row.finalRiskScore, 0) / ranked.length
          : 0,
      avgBurdenPerFrame:
        ranked.length > 0
          ? ranked.reduce((sum, row) => sum + row.trackLen, 0) / ranked.length
          : 0,
    }

    return {
      rankedCandidates: ranked,
      topCandidates,
      displayCandidates,
      summary,
    }
  }, [allCandidates, riskState])
}
