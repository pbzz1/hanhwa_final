import type { FmcwMvpBundle } from './fmcwMockData'
import { FmcwBevPanel } from './FmcwBevPanel'

type Props = {
  bundle: FmcwMvpBundle
}

export function FmcwServiceDock({ bundle }: Props) {
  return (
    <section className="service-fmcw-dock" aria-label="FMCW 레이더 리포트 및 BEV">
      <header className="service-fmcw-dock__head">
        <h2 className="service-fmcw-dock__title">FMCW · Radar report &amp; tracks</h2>
        <p className="service-fmcw-dock__lead muted">
          드론 근접 이후 저거리 위상·속도 추정(mock). BEV는 탑뷰 스캐폴드이며 실제 BEV 파이프라인 데이터는 없습니다.
        </p>
      </header>
      <div className="service-fmcw-dock__grid">
        <div className="service-fmcw-dock__card">
          <h3 className="service-fmcw-dock__card-title">Radar report</h3>
          <ul className="service-fmcw-dock__report">
            {bundle.radarReportLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <dl className="service-fmcw-dock__kv">
            <div>
              <dt>위험구역</dt>
              <dd>{bundle.zoneLabel}</dd>
            </div>
            <div>
              <dt>탐지 거리</dt>
              <dd>{bundle.detectionRangeKm.toFixed(1)} km</dd>
            </div>
            <div>
              <dt>접근 속도</dt>
              <dd>{bundle.approachSpeedMps.toFixed(1)} m/s (융합 추정)</dd>
            </div>
            <div>
              <dt>예상 진입 경로</dt>
              <dd>{bundle.ingressSummary}</dd>
            </div>
          </dl>
        </div>
        <div className="service-fmcw-dock__card">
          <h3 className="service-fmcw-dock__card-title">Track list</h3>
          <ul className="service-fmcw-dock__tracks">
            {bundle.tracks.map((t) => (
              <li key={t.trackId}>
                <div className="service-fmcw-dock__track-head">
                  <strong>{t.trackId}</strong>
                  <span>{t.classLabel}</span>
                </div>
                <p className="muted">
                  {t.rangeM.toLocaleString()} m · {t.speedMps.toFixed(1)} m/s · 방위 {t.bearingDeg}°
                </p>
                <p className="service-fmcw-dock__track-note">{t.threatNote}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="service-fmcw-dock__card service-fmcw-dock__card--bev">
          <h3 className="service-fmcw-dock__card-title">BEV visualization</h3>
          <FmcwBevPanel tracks={bundle.tracks} bearingDeg={bundle.ingressBearingDeg} />
        </div>
      </div>
    </section>
  )
}
