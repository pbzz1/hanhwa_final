import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export const SENSOR_WEB_PIPELINE_STEPS = [
  { step: 'sat_sar' as const, short: 'SAR 광역', num: 1 },
  { step: 'uav_sar' as const, short: 'UAV', num: 2 },
  { step: 'fmcw' as const, short: 'FMCW·VoD', num: 3 },
  { step: 'drone' as const, short: '드론 EO/IR', num: 4 },
]

export type SensorWebPipelineStepId = (typeof SENSOR_WEB_PIPELINE_STEPS)[number]['step']

type Props = {
  activeStep: SensorWebPipelineStepId
  title: string
  lead: ReactNode
  /** 오른쪽 카드 제목 (예: 이 단계 역할, 데이터) */
  detailTitle: string
  detail: ReactNode
  demoTitle: string
  demoLead?: ReactNode
  demo: ReactNode
  /** 데모 영역 래퍼에 `sensor-drone-stage` 등 추가 */
  demoWrapClassName?: string
  /** 데모 아래 확장 블록(FMCW 상세 등) */
  belowDemo?: ReactNode
  actions?: ReactNode
  /** 없으면 하단 «다음 단계» 버튼 숨김(드론 전용 페이지 등) */
  nextStep?: { label: string; onContinue: () => void }
  /** 시나리오 4 임베드 등 — page 래퍼·제목 레벨 축소 */
  embedded?: boolean
  /** 비임베드 시 최상단 section에 추가 (예: drone-eoir-page) */
  pageClassName?: string
}

/**
 * 드론 EO/IR 페이지와 동일: 웹 파이프라인 위치(좌) + 단계 설명(우) + 하단 데모 + 계속 버튼
 */
export function SensorStagePipelineFrame({
  activeStep,
  title,
  lead,
  detailTitle,
  detail,
  demoTitle,
  demoLead,
  demo,
  demoWrapClassName,
  belowDemo,
  actions,
  nextStep,
  embedded = false,
  pageClassName,
}: Props) {
  const HeadingTag = embedded ? 'h2' : 'h1'
  const titleClass = embedded ? 'drone-eoir-embed-title' : undefined

  const inner = (
    <div className={embedded ? 'drone-eoir-panel drone-eoir-panel--embedded' : 'drone-eoir-panel'}>
      <div className="drone-eoir-head">
        <div>
          <HeadingTag className={titleClass}>{title}</HeadingTag>
          <p className="muted">{lead}</p>
        </div>
      </div>

      <div className="sensor-flow-overview-grid drone-eoir-flow-grid">
        <div className="sensor-flow-overview-card">
          <h2 className="sensor-flow-overview-title">웹 파이프라인 위치</h2>
          <ol className="sensor-flow-overview-list drone-eoir-pipeline-list">
            {SENSOR_WEB_PIPELINE_STEPS.map((p) => (
              <li
                key={p.step}
                className={p.step === activeStep ? 'sensor-flow-overview-li--active' : undefined}
              >
                <span className="sensor-flow-overview-idx">{p.num}</span>
                <NavLink to={`/sensor-pipeline?step=${p.step}`} className="drone-eoir-pipeline-link">
                  {p.short}
                </NavLink>
                {p.step === activeStep ? (
                  <span className="muted drone-eoir-here">← 현재 단계</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="sensor-flow-overview-card sensor-flow-overview-card--scenario">
          <h2 className="sensor-flow-overview-title">{detailTitle}</h2>
          {detail}
        </div>
      </div>

      <div className="drone-eoir-viewport-wrap">
        <h2 className="drone-eoir-subh">{demoTitle}</h2>
        {demoLead ? <p className="muted drone-eoir-sublead">{demoLead}</p> : null}
        <div className={demoWrapClassName ?? 'sensor-stage-demo-shell'}>{demo}</div>
      </div>

      {actions ? <div className="drone-eoir-actions">{actions}</div> : null}

      {belowDemo}

      {nextStep ? (
        <footer className="sensor-intro-page__actions sensor-stage-pipeline-page__footer">
          <button type="button" className="btn-primary" onClick={nextStep.onContinue}>
            {nextStep.label}
          </button>
        </footer>
      ) : null}
    </div>
  )

  if (embedded) {
    return inner
  }

  return (
    <section
      className={['page', 'sensor-stage-pipeline-page', pageClassName].filter(Boolean).join(' ')}
    >
      {inner}
    </section>
  )
}
