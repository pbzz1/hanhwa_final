import { RiskDetailPanel } from '../risk/RiskDetailPanel'
import { TopRiskList } from '../risk/TopRiskList'
import type { RiskCandidateE2E, RiskUiState } from '../../types/risk'

type RightInfoPanelProps = {
  riskState: RiskUiState
  topCandidates: RiskCandidateE2E[]
  selectedCandidateId: string | null
  selectedCandidate: RiskCandidateE2E | null
  onSelectCandidate: (id: string) => void
}

export function RightInfoPanel({
  riskState,
  topCandidates,
  selectedCandidateId,
  selectedCandidate,
  onSelectCandidate,
}: RightInfoPanelProps) {
  return (
    <>
      <TopRiskList rows={topCandidates} selectedId={selectedCandidateId} onSelect={onSelectCandidate} />
      <RiskDetailPanel visible={riskState.showRiskDetailPanel} row={selectedCandidate} />
    </>
  )
}
