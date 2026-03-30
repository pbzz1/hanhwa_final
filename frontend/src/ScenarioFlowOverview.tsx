type Props = {
  onStart: () => void
}

const STEPS = [
  { n: '1', name: '항공 SAR', desc: '광역 변화분석으로 이상 징후(예: 전차급 신호 소실) 탐지' },
  { n: '2', name: 'UAV SAR', desc: '드론 탑재 SAR·EO로 표적 궤적·세부 영상 확보' },
  { n: '3', name: '펄스 레이더', desc: '중원거리 광역 탐지, 거친 거리·방위(점 탐지)' },
  {
    n: '4',
    name: 'FMCW·VoD',
    desc: 'live 스냅샷(영상·부가 설명) + 근거리 레이더 개념 — 5단계 지도에 점·방위로 적용',
  },
  { n: '통합', name: '시뮬레이션', desc: '한 화면에서 거리에 따른 센서 전환을 재생' },
] as const

/**
 * 0단계: 전체 관측·교전 센서 흐름 요약
 */
export function ScenarioFlowOverview({ onStart }: Props) {
  return (
    <div className="scenario-flow-overview">
      <header className="scenario-flow-overview__head">
        <h2 className="scenario-flow-overview__title">관측 → 추적 → 교전 지원 흐름 (요약)</h2>
        <p className="muted scenario-flow-overview__lead">
          <strong>광역에서 좁혀 들어가는</strong> 순서입니다. 앞 페이지에서 센서별 <strong>모델 역할</strong>과{' '}
          <strong>입력·출력</strong>을 보고, 마지막에 <strong>통합 시뮬</strong>로 연결해 확인합니다.
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

      <p className="muted scenario-flow-overview__footnote">
        데모에서는 거리·시나리오가 단순화되어 있으며, 실제 운용 시 센서 가용성·기상·전파 환경에 따라 단계가
        병행·생략될 수 있습니다.
      </p>

      <div className="scenario-flow-overview__actions">
        <button type="button" className="btn-primary" onClick={onStart}>
          1단계: 항공 SAR로 시작
        </button>
      </div>
    </div>
  )
}
