import { useState } from 'react'
import type { RiskUiState } from '../../types/risk'

type RiskModeSwitchProps = {
  riskState: RiskUiState
  updateRiskState: (patch: Partial<RiskUiState>) => void
}

export function RiskModeSwitch({ riskState, updateRiskState }: RiskModeSwitchProps) {
  const [debugOpen, setDebugOpen] = useState(false)
  return (
    <section className="service-panel-section risk-mode-switch-panel">
      <div className="risk-mode-switch-panel__head">
        <h3>Risk 모드</h3>
        <button type="button" className="btn-secondary" onClick={() => setDebugOpen((v) => !v)}>
          {debugOpen ? '디버그 접기' : '디버그 펼치기'}
        </button>
      </div>
      <div className="risk-mode-grid">
        <label>
          pipeline
          <select
            value={riskState.pipelineMode}
            onChange={(event) => updateRiskState({ pipelineMode: event.target.value as RiskUiState['pipelineMode'] })}
          >
            <option value="full">full</option>
            <option value="ops">ops</option>
            <option value="ops_t20">ops_t20</option>
            <option value="ops_t15">ops_t15</option>
          </select>
        </label>
        <label>
          risk score
          <select
            value={riskState.riskScoreMode}
            onChange={(event) => updateRiskState({ riskScoreMode: event.target.value as RiskUiState['riskScoreMode'] })}
          >
            <option value="rule">rule</option>
            <option value="ml">ml</option>
            <option value="hybrid">hybrid</option>
            <option value="final">final</option>
          </select>
        </label>
        <label>
          lidar mode
          <select
            value={riskState.lidarMode}
            onChange={(event) => updateRiskState({ lidarMode: event.target.value as RiskUiState['lidarMode'] })}
          >
            <option value="assisted">assisted</option>
            <option value="radar_only">radar_only</option>
            <option value="both">both</option>
          </select>
        </label>
        <label>
          cluster algo
          <select
            value={riskState.clusterAlgoMode}
            onChange={(event) =>
              updateRiskState({ clusterAlgoMode: event.target.value as RiskUiState['clusterAlgoMode'] })
            }
          >
            <option value="hdbscan">hdbscan</option>
            <option value="dbscan">dbscan</option>
          </select>
        </label>
        <label>
          top-k
          <select
            value={riskState.topKMode}
            onChange={(event) => updateRiskState({ topKMode: event.target.value as RiskUiState['topKMode'] })}
          >
            <option value="top5">top5</option>
            <option value="top10">top10</option>
            <option value="top20">top20</option>
            <option value="all">all</option>
          </select>
        </label>
      </div>
      <div className="risk-mode-toggle-grid">
        <label>
          <input
            type="checkbox"
            checked={riskState.showRiskZones}
            onChange={() => updateRiskState({ showRiskZones: !riskState.showRiskZones })}
          />
          위험지역 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={riskState.showRiskTracks}
            onChange={() => updateRiskState({ showRiskTracks: !riskState.showRiskTracks })}
          />
          위험 트랙 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={riskState.showTopRiskOnly}
            onChange={() => updateRiskState({ showTopRiskOnly: !riskState.showTopRiskOnly })}
          />
          Top-K 중심
        </label>
        <label>
          <input
            type="checkbox"
            checked={riskState.showAllCandidates}
            onChange={() => updateRiskState({ showAllCandidates: !riskState.showAllCandidates })}
          />
          전체 후보 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={riskState.showRiskDetailPanel}
            onChange={() => updateRiskState({ showRiskDetailPanel: !riskState.showRiskDetailPanel })}
          />
          상세 패널 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={riskState.showRiskLegend}
            onChange={() => updateRiskState({ showRiskLegend: !riskState.showRiskLegend })}
          />
          범례 표시
        </label>
      </div>
      {debugOpen && (
        <div className="risk-mode-debug">
          <label>
            comparison
            <select
              value={riskState.comparisonMode}
              onChange={(event) =>
                updateRiskState({ comparisonMode: event.target.value as RiskUiState['comparisonMode'] })
              }
            >
              <option value="none">none</option>
              <option value="rule_only">rule_only</option>
              <option value="no_lidar">no_lidar</option>
              <option value="no_tracking_features">no_tracking_features</option>
              <option value="no_calibration">no_calibration</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={riskState.showSuppressionStage}
              onChange={() => updateRiskState({ showSuppressionStage: !riskState.showSuppressionStage })}
            />
            suppression stage 표시
          </label>
        </div>
      )}
    </section>
  )
}
