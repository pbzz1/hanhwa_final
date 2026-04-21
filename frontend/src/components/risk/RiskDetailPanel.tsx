import type { RiskCandidateE2E } from '../../types/risk'
import { formatRiskScore } from '../../utils/riskFormat'
import { RISK_LABEL_KO } from '../../utils/riskStyle'

type RiskDetailPanelProps = {
  visible: boolean
  row: RiskCandidateE2E | null
}

function rowLine(label: string, value: string) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function RiskDetailPanel({ visible, row }: RiskDetailPanelProps) {
  if (!visible) return null
  return (
    <section className="service-panel-section risk-detail-panel">
      <h3>Risk 상세</h3>
      {!row ? (
        <p className="muted">후보를 선택하면 상세 정보를 표시합니다.</p>
      ) : (
        <>
          <p className="muted">
            위험등급(rule/hybrid/final): {RISK_LABEL_KO[row.riskLabelRule]} /{' '}
            {RISK_LABEL_KO[row.riskLabelHybrid]} / {RISK_LABEL_KO[row.riskLabelFinal]}
          </p>
          <dl className="risk-detail-dl">
            {rowLine('final risk', formatRiskScore(row.finalRiskScore))}
            {rowLine('hybrid score', formatRiskScore(row.riskScoreHybrid))}
            {rowLine('rule score', formatRiskScore(row.riskScoreRule))}
            {rowLine('ML score', formatRiskScore(row.riskScoreMl))}
            {rowLine('global rank', `#${row.rankGlobal}`)}
            {rowLine('top tag', row.topTag ?? '-')}
            {rowLine('pipeline', row.pipelineMode)}
            {rowLine('frame id', row.frameId)}
            {rowLine('cluster id', row.clusterUid)}
            {rowLine('track id', row.trackId)}
            {rowLine('track age', String(row.trackAge))}
            {rowLine('track len', String(row.trackLen))}
            {rowLine('avg speed', `${row.avgSpeed.toFixed(1)} km/h`)}
            {rowLine('approach', formatRiskScore(row.approachScore))}
            {rowLine('temporal stability', formatRiskScore(row.temporalStability))}
            {rowLine('motion smoothness', formatRiskScore(row.motionSmoothnessScore))}
            {rowLine('closing consistency', formatRiskScore(row.closingConsistencyScore))}
            {rowLine('trajectory proxy', formatRiskScore(row.trajectoryRiskProxy))}
            {rowLine('lidar mode', row.lidarMode)}
            {rowLine('corroboration', formatRiskScore(row.lidarCorroborationScore))}
            {rowLine('lidar min dist', `${row.lidarMinDist.toFixed(1)} m`)}
            {rowLine(
              'lidar density',
              `r1 ${row.lidarLocalDensityR1.toFixed(1)} / r2 ${row.lidarLocalDensityR2.toFixed(1)} / r3 ${row.lidarLocalDensityR3.toFixed(1)}`,
            )}
            {rowLine('algorithm', row.algorithm)}
            {rowLine('feature set', row.featureSet)}
            {rowLine('source model', row.sourceModel)}
            {rowLine('split mode', row.splitMode)}
            {rowLine('suppression', row.suppressionStage)}
          </dl>
          <p className="muted">
            고위험 후보 / 우선 감시 구역 / 위험지역 후보 / 추적 기반 위험 우선순위 표현만 사용하고 단정 문구는
            사용하지 않습니다.
          </p>
        </>
      )}
    </section>
  )
}
