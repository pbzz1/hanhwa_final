import { RISK_LABEL_COLOR, RISK_LABEL_KO } from '../../utils/riskStyle'

type RiskLegendProps = {
  visible: boolean
}

export function RiskLegend({ visible }: RiskLegendProps) {
  if (!visible) return null
  return (
    <section className="service-panel-section risk-legend-panel">
      <h3>위험 범례</h3>
      <ul className="risk-legend-list">
        {(Object.keys(RISK_LABEL_KO) as Array<keyof typeof RISK_LABEL_KO>).map((label) => (
          <li key={label}>
            <span className="risk-legend-dot" style={{ backgroundColor: RISK_LABEL_COLOR[label] }} />
            {RISK_LABEL_KO[label]}
          </li>
        ))}
      </ul>
    </section>
  )
}
