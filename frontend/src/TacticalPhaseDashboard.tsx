import { FmcwRadarScatter3D } from './FmcwRadarScatter3D'
import { RadarCharts2D } from './RadarCharts2D'
import { SCENARIO_RANGES_KM } from './scenarioBattalion'

type EnemyBrief = {
  codename: string
  enemyBranch: string
  threatLevel: string
  droneVideoUrl: string
}

type FmcwDet = {
  id: string
  lat: number
  lng: number
  rangeM: number
  azimuthDeg: number
  elevationDeg: number
  dopplerMps: number
  confidence: number
  phaseDeg: number
}

type TrackBrief = {
  bearingDeg: number
  phaseRefDeg: number
} | null

type RadarChartsPayload = {
  headingDeg: number
  fovDeg: number
  rangeMaxM: number
  detections: FmcwDet[]
  track: TrackBrief
}

type Props = {
  enemyDistanceKm: number | null
  simProgress: number
  /** 통합 시뮬(5페이지) 내부: 3=펄스 대기, 4=펄스, 5=FMCW */
  tacticalSubStep: 3 | 4 | 5
  pulseInRange: boolean
  pulseUncertainBand: boolean
  fmcwInRange: boolean
  c2Name: string
  enemy: EnemyBrief | null
  onOpenDroneVideo: () => void
  radarCharts: RadarChartsPayload | null
  radarCentroid: { rangeM: number; azimuthDeg: number; elevationDeg: number } | null
}

const GAUGE_MAX_KM = 55

/**
 * 통합 시뮬 — 카카오맵 없이 펄스·FMCW를 스키매틱으로 표현
 */
export function TacticalPhaseDashboard({
  enemyDistanceKm,
  simProgress,
  tacticalSubStep,
  pulseInRange,
  pulseUncertainBand,
  fmcwInRange,
  c2Name,
  enemy,
  onOpenDroneVideo,
  radarCharts,
  radarCentroid,
}: Props) {
  const d = enemyDistanceKm
  const gaugePct =
    d == null ? 0 : Math.min(100, Math.max(0, (d / GAUGE_MAX_KM) * 100))
  const linePct =
    d == null ? 100 : Math.min(100, Math.max(8, (d / GAUGE_MAX_KM) * 100))

  return (
    <div className="tactical-dash" aria-label="전술 대시보드 (무지도)">
      <div className="tactical-dash__grid">
        <section className="tactical-dash__card tactical-dash__card--range">
          <h3 className="tactical-dash__h">지휘통제실 ↔ 우선 표적 거리</h3>
          <p className="tactical-dash__km">
            {d == null ? '—' : <>{d.toFixed(1)} km</>}
          </p>
          <div className="tactical-dash__gauge" aria-hidden>
            <div className="tactical-dash__gauge-track">
              <div
                className="tactical-dash__gauge-fill"
                style={{ width: `${gaugePct}%` }}
              />
              <span
                className="tactical-dash__gauge-tick tactical-dash__gauge-tick--40"
                style={{ left: `${(SCENARIO_RANGES_KM.PULSE_MAX / GAUGE_MAX_KM) * 100}%` }}
                title="40km"
              />
              <span
                className="tactical-dash__gauge-tick tactical-dash__gauge-tick--15"
                style={{ left: `${(SCENARIO_RANGES_KM.FMCW_MAX / GAUGE_MAX_KM) * 100}%` }}
                title="15km"
              />
            </div>
            <div className="tactical-dash__gauge-labels">
              <span>0</span>
              <span>15km FMCW</span>
              <span>40km MDL·펄스</span>
              <span>{GAUGE_MAX_KM}km</span>
            </div>
          </div>
          <p className="muted tactical-dash__hint">
            통합 시뮬 ·{' '}
            {tacticalSubStep === 3
              ? '펄스 대기(40km 권역 밖/미진입)'
              : tacticalSubStep === 4
                ? '펄스(≤40km)'
                : 'FMCW(≤15km)'}
            {' · '}진행 {Math.round(simProgress * 100)}%
          </p>
        </section>

        <section className="tactical-dash__card tactical-dash__card--schematic">
          <h3 className="tactical-dash__h">교전 축 (개념도)</h3>
          <div className="tactical-dash__axis" aria-hidden>
            <div className="tactical-dash__node tactical-dash__node--c2">
              <span className="tactical-dash__node-dot" />
              <span className="tactical-dash__node-label">C2</span>
              <span className="tactical-dash__node-sub">{c2Name}</span>
            </div>
            <div className="tactical-dash__axis-line-wrap">
              <div
                className="tactical-dash__axis-line"
                style={{ width: `${linePct}%` }}
              />
            </div>
            <div className="tactical-dash__node tactical-dash__node--enemy">
              <span className="tactical-dash__node-dot tactical-dash__node-dot--enemy" />
              <span className="tactical-dash__node-label">적</span>
              <span className="tactical-dash__node-sub">
                {enemy?.codename ?? '표적'}
              </span>
            </div>
          </div>
          <p className="muted tactical-dash__hint">
            북에서 남하하는 주 표적과 대대 지휘통제실 간 거리를 수치로만 표시합니다. 지도와 동일한 시뮬 데이터입니다.
          </p>
        </section>

        <section className="tactical-dash__card tactical-dash__card--radar">
          <h3 className="tactical-dash__h">레이더 스캔 (모의)</h3>
          <div className={`tactical-dash__radar-face${pulseInRange ? ' tactical-dash__radar-face--on' : ''}`}>
            {pulseInRange && <div className="tactical-dash__radar-sweep" aria-hidden />}
            {!pulseInRange && (
              <p className="tactical-dash__radar-idle muted">40km 권역 진입 시 펄스 스캔 활성</p>
            )}
            {pulseUncertainBand && (
              <p className="tactical-dash__radar-caption">
                펄스 · <strong>미확인 물체 확인</strong> 구간 (15~40km)
              </p>
            )}
            {fmcwInRange && !pulseUncertainBand && (
              <p className="tactical-dash__radar-caption tactical-dash__radar-caption--fmcw">
                FMCW 정밀 구간 (≤15km)
              </p>
            )}
          </div>
        </section>
      </div>

      {fmcwInRange && radarCharts && radarCharts.detections.length > 0 && (
        <section className="tactical-dash__card tactical-dash__card--fmcw-wide">
          <h3 className="tactical-dash__h">FMCW — 방위·거리·도플러 (무지도 시각화)</h3>
          <p className="muted tactical-dash__hint">
            주시 방위 <strong>{radarCharts.headingDeg}°</strong> · 시야각{' '}
            <strong>{radarCharts.fovDeg}°</strong> · 최대{' '}
            <strong>{(radarCharts.rangeMaxM / 1000).toFixed(1)} km</strong>
            {radarCharts.track && (
              <>
                {' '}
                · 예측 이동 방위 <strong>{radarCharts.track.bearingDeg}°</strong> · 위상 기준{' '}
                <strong>{radarCharts.track.phaseRefDeg}°</strong>
              </>
            )}
          </p>
          <div className="tactical-dash__fmcw-grid">
            <div>
              <p className="tactical-dash__viz-title">2D Range–Azimuth</p>
              <RadarCharts2D detections={radarCharts.detections} />
            </div>
            {radarCentroid && (
              <div>
                <p className="tactical-dash__viz-title">3D 산점도 (탐지 평균)</p>
                <FmcwRadarScatter3D
                  rangeM={radarCentroid.rangeM}
                  azimuthDeg={radarCentroid.azimuthDeg}
                  elevationDeg={radarCentroid.elevationDeg}
                  className="tactical-dash__canvas3d"
                />
              </div>
            )}
          </div>
        </section>
      )}

      {tacticalSubStep >= 5 && enemy && (
        <div className="tactical-dash__drone">
          <button type="button" className="btn-primary tactical-dash__drone-btn" onClick={onOpenDroneVideo}>
            드론 정찰 영상 재생
          </button>
          <span className="muted tactical-dash__drone-note">
            {enemy.codename} · {enemy.enemyBranch}
          </span>
        </div>
      )}
    </div>
  )
}
