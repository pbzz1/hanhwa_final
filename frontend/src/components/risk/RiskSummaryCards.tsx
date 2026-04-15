import type { RiskPipelineMode, RiskPipelineSummary } from '../../types/risk'
import { formatRiskScore } from '../../utils/riskFormat'

type RiskSummaryCardsProps = {
  pipelineMode: RiskPipelineMode
  summaries: RiskPipelineSummary[]
  totalCount: number
}

export function RiskSummaryCards({ pipelineMode, summaries, totalCount }: RiskSummaryCardsProps) {
  const selected = summaries.find((row) => row.pipelineMode === pipelineMode) ?? null
  if (!selected) return null
  return (
    <section className="service-panel-section risk-summary-panel">
      <h3>Risk E2E 요약</h3>
      <div className="risk-summary-grid">
        <article>
          <p>Pipeline</p>
          <strong>{pipelineMode}</strong>
        </article>
        <article>
          <p>Macro F1</p>
          <strong>{selected.macroF1.toFixed(6)}</strong>
        </article>
        <article>
          <p>High Recall</p>
          <strong>{selected.highRecall.toFixed(6)}</strong>
        </article>
        <article>
          <p>Ranking AP</p>
          <strong>{selected.rankingAp.toFixed(6)}</strong>
        </article>
        <article>
          <p>Burden/frame</p>
          <strong>{selected.burdenPerFrame.toFixed(2)}</strong>
        </article>
        <article>
          <p>현재 후보</p>
          <strong>{totalCount}개</strong>
        </article>
      </div>
      <p className="muted risk-summary-note">
        calibration_used: {selected.calibrationUsed ? 'true' : 'false'} · runtime_sec_total:{' '}
        {formatRiskScore(selected.runtimeSecTotal)}
      </p>
      {selected.note ? <p className="muted risk-summary-note">{selected.note}</p> : null}
    </section>
  )
}
