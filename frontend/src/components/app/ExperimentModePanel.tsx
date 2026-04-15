import { RiskLegend } from '../risk/RiskLegend'
import { RiskModeSwitch } from '../risk/RiskModeSwitch'
import { RiskSummaryCards } from '../risk/RiskSummaryCards'
import type { RiskPipelineSummary, RiskUiState } from '../../types/risk'

type ExperimentModePanelProps = {
  riskState: RiskUiState
  updateRiskState: (patch: Partial<RiskUiState>) => void
  summaries: RiskPipelineSummary[]
  totalCount: number
}

export function ExperimentModePanel({
  riskState,
  updateRiskState,
  summaries,
  totalCount,
}: ExperimentModePanelProps) {
  return (
    <>
      <RiskModeSwitch riskState={riskState} updateRiskState={updateRiskState} />
      <RiskSummaryCards pipelineMode={riskState.pipelineMode} summaries={summaries} totalCount={totalCount} />
      <RiskLegend visible={riskState.showRiskLegend} />
    </>
  )
}
