type Props = {
  onStart: () => void
}

const STEPS = [
  { n: '1', name: 'SAR 광역', desc: '광역 탐지·변화분석' },
  { n: '2', name: 'UAV', desc: '실시간 추적·EO/IR' },
  { n: '3', name: 'FMCW', desc: '근거리 레이더·VoD 연동' },
  { n: '4', name: '통합', desc: '종합 상황도' },
] as const

/**
 * 0단계: 전체 관측·교전 센서 흐름 요약
 */
export function ScenarioFlowOverview({ onStart }: Props) {
  return (
    <div className="scenario-flow-overview">
      <header className="scenario-flow-overview__head">
        <h2 className="scenario-flow-overview__title">다층 감시 흐름</h2>
        <p className="muted scenario-flow-overview__lead">
          광역 → 추적 → 정밀 식별 → <strong>통합 상황판</strong>
        </p>
      </header>

      <ol className="scenario-flow-overview__track" aria-label="단계 순서">
        {STEPS.map((s, i) => (
          <li key={s.n} className="scenario-flow-overview__node">
            <span className="scenario-flow-overview__node-badge">{s.n}</span>
            <div className="scenario-flow-overview__node-body">
              <strong className="scenario-flow-overview__node-name">{s.name}</strong>
              <p className="muted scenario-flow-overview__node-desc">{s.desc}</p>
            </div>
            {i < STEPS.length - 1 && <span className="scenario-flow-overview__arrow" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="scenario-flow-overview__actions">
        <button type="button" className="btn-primary" onClick={onStart}>
          1단계 시작
        </button>
      </div>
    </div>
  )
}
