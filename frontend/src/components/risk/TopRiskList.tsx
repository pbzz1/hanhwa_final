import type { RiskCandidateE2E } from '../../types/risk'
import { formatRiskScore } from '../../utils/riskFormat'
import { RISK_LABEL_KO } from '../../utils/riskStyle'

type TopRiskListProps = {
  rows: RiskCandidateE2E[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function TopRiskList({ rows, selectedId, onSelect }: TopRiskListProps) {
  return (
    <section className="service-panel-section risk-top-list-panel">
      <h3>Top Risk 목록</h3>
      {rows.length === 0 ? (
        <p className="muted">현재 필터에서 표시할 후보가 없습니다.</p>
      ) : (
        <ul className="risk-top-list">
          {rows.map((row, idx) => (
            <li key={row.id}>
              <button
                type="button"
                className={`risk-top-list__item${selectedId === row.id ? ' risk-top-list__item--active' : ''}`}
                onClick={() => onSelect(row.id)}
              >
                <div className="risk-top-list__head">
                  <strong>#{idx + 1}</strong>
                  <span>{RISK_LABEL_KO[row.riskLabelFinal]}</span>
                </div>
                <p>score {formatRiskScore(row.finalRiskScore)} · frame {row.frameId}</p>
                <p>
                  track {row.trackId} · speed {row.avgSpeed.toFixed(1)}km/h · approach{' '}
                  {formatRiskScore(row.approachScore)}
                </p>
                <p>lidar corroboration {formatRiskScore(row.lidarCorroborationScore)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
