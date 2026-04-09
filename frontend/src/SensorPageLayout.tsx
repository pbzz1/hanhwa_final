import type { ReactNode } from 'react'

type Props = {
  stepLabel: string
  title: string
  lead: ReactNode
  modelTitle: string
  modelBody: ReactNode
  inputTitle?: string
  inputItems: string[]
  /** 입력 패널 하단 시각 자료(SAR 타일 등) */
  inputVisual?: ReactNode
  outputTitle?: string
  outputItems: string[]
  children: ReactNode
  continueLabel: string
  onContinue: () => void
}

/**
 * 센서별 인트로 페이지 공통 레이아웃 — 모델 설명 + 입·출력 + 시각화 슬롯
 */
export function SensorPageLayout({
  stepLabel,
  title,
  lead,
  modelTitle,
  modelBody,
  inputTitle = '입력 (Input)',
  inputItems,
  inputVisual,
  outputTitle = '출력 (Output)',
  outputItems,
  children,
  continueLabel,
  onContinue,
}: Props) {
  return (
    <div className="sensor-intro-page">
      <header className="sensor-intro-page__head">
        <p className="sensor-intro-page__step muted">{stepLabel}단계</p>
        <h2 className="sensor-intro-page__title">{title}</h2>
        <p className="muted sensor-intro-page__lead">{lead}</p>
      </header>

      <section className="sensor-intro-page__panel sensor-intro-page__panel--model" aria-labelledby="sensor-model-h">
        <h3 id="sensor-model-h" className="sensor-intro-page__h">
          {modelTitle}
        </h3>
        <div className="sensor-intro-page__model-body">{modelBody}</div>
      </section>

      <div className="sensor-intro-page__io" role="group" aria-label="입력과 출력">
        <section className="sensor-intro-page__panel sensor-intro-page__panel--io" aria-labelledby="sensor-in-h">
          <h3 id="sensor-in-h" className="sensor-intro-page__h">
            {inputTitle}
          </h3>
          <ul className="sensor-intro-page__list">
            {inputItems.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {inputVisual ? (
            <div className="sensor-intro-page__input-visual">{inputVisual}</div>
          ) : null}
        </section>
        <section className="sensor-intro-page__panel sensor-intro-page__panel--io" aria-labelledby="sensor-out-h">
          <h3 id="sensor-out-h" className="sensor-intro-page__h">
            {outputTitle}
          </h3>
          <ul className="sensor-intro-page__list">
            {outputItems.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="sensor-intro-page__viz">{children}</div>

      <footer className="sensor-intro-page__actions">
        <button type="button" className="btn-primary" onClick={onContinue}>
          {continueLabel}
        </button>
      </footer>
    </div>
  )
}
