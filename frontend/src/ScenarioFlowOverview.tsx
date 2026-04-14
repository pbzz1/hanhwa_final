type Props = {
  onStart: () => void
}

const STEPS = [
  {
    n: '1',
    name: 'SAR 광역',
    desc: 'Sentinel-1 조기경보 — Sub-Aperture·RCS/OSM 후보',
  },
  {
    n: '2',
    name: 'UAV',
    desc: 'MSFA·SARDet 좌표 유도 후 YOLO+ByteTrack·EO/IR',
  },
  {
    n: '3',
    name: 'FMCW',
    desc: 'VoD FMCW·DBSCAN — 레이더 인계·위험 예측',
  },
  {
    n: '4',
    name: '드론 EO/IR',
    desc: '근접 정찰·EO/IR·파이프라인 4단계',
  },
  {
    n: '5',
    name: '통합',
    desc: '지도·시뮬·이벤트·전술 — 웹 C2',
  },
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
          <strong>광역 SAR → UAV → FMCW → 드론 EO/IR → 통합 상황판</strong> 순으로 시나리오를 진행합니다.
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
