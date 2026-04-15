import { useCallback, useState } from 'react'
import type { RiskUiState } from '../types/risk'

export const DEFAULT_RISK_UI_STATE: RiskUiState = {
  showRiskZones: true,
  showRiskTracks: true,
  showTopRiskOnly: true,
  showRiskDetailPanel: true,
  showRiskLegend: true,
  showAllCandidates: false,
  pipelineMode: 'ops_t15',
  riskScoreMode: 'final',
  lidarMode: 'both',
  clusterAlgoMode: 'hdbscan',
  topKMode: 'top5',
  comparisonMode: 'none',
  showSuppressionStage: false,
}

export function useRiskFilters() {
  const [riskState, setRiskState] = useState<RiskUiState>(DEFAULT_RISK_UI_STATE)

  const updateRiskState = useCallback((patch: Partial<RiskUiState>) => {
    setRiskState((prev) => ({ ...prev, ...patch }))
  }, [])

  return {
    riskState,
    updateRiskState,
  }
}
