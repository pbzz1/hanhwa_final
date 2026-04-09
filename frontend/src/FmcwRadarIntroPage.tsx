import { useEffect, useState } from 'react'
import { RadarCharts2D } from './RadarCharts2D'
import { FMCW_INTRO_DETECTIONS } from './fmcwIntroDemoData'
import { SensorPageLayout } from './SensorPageLayout'
import { getApiBaseUrl } from './apiBaseUrl'

/** 3단계 VoD·live 스냅샷 표시에 필요한 최소 필드만 */
type IntroRadarSnapshot = {
  fmcw: {
    meta: {
      vodReferenceNote: string
      representationNote: string
      liveRun?: {
        ok: boolean
        frameId?: string
        inferMs?: number
        radarPipeline?: string
        radarPointCount?: number
        error?: string
      } | null
    }
    insights?: {
      frameId?: string
      annotatedImageBase64?: string | null
      primaryObject?: { label: string; confidence: number } | null
      conclusionBullets?: string[]
      lidarReviewParagraph?: string
      syncedViewNote?: string
      lidarValidation?: {
        pointsInRoi?: number
        deltaRangeM?: number | null
        deltaBearingDeg?: number | null
        verdict?: string
      } | null
    } | null
    detections: Array<Record<string, unknown>>
  }
}

type Props = {
  onContinue: () => void
}

export function FmcwRadarIntroPage({ onContinue }: Props) {
  const [vodSnap, setVodSnap] = useState<IntroRadarSnapshot | null>(null)
  const [vodStatus, setVodStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    setVodStatus('loading')
    void (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/map/radar/snapshot?source=live`)
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as IntroRadarSnapshot
        if (!cancelled) {
          setVodSnap(data)
          setVodStatus('ok')
        }
      } catch {
        if (!cancelled) {
          setVodSnap(null)
          setVodStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const insights = vodSnap?.fmcw.insights
  const hasVodBody =
    insights &&
    (insights.annotatedImageBase64 ||
      (insights.conclusionBullets && insights.conclusionBullets.length > 0) ||
      insights.lidarReviewParagraph)

  return (
    <SensorPageLayout
      stepLabel="3"
      title="FMCW · VoD"
      lead={
        <>
          <code>?source=live</code> 스냅샷·차트. 통합 상황도에 <strong>점·방위·궤적</strong> 반영.
        </>
      }
      modelTitle="파이프라인(요약)"
      modelBody={
        <>
          <p>Chirp → 거리, 위상 → 도플러/속도.</p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            VoD는 서버 동기 시 표시. 미연결 시 아래 차트.
          </p>
        </>
      }
      inputItems={['I/Q·chirp', '파형·캘리브', '동기 cam+radar']}
      outputItems={['탐지·트랙', '예측 궤적 → 통합 상황']}
      continueLabel="통합 상황"
      onContinue={onContinue}
    >
      <section className="fmcw-intro-vod" aria-label="VoD·live FMCW 스냅샷">
        <h3 className="fmcw-intro-vod__title">VoD · live</h3>
        {vodStatus === 'loading' && (
          <p className="muted fmcw-intro-vod__status">live 스냅샷 불러오는 중…</p>
        )}
        {vodStatus === 'error' && (
          <p className="muted fmcw-intro-vod__status">
            백엔드에 연결할 수 없습니다. 아래 차트를 확인한 뒤 통합 상황 단계로 이동하세요.
          </p>
        )}
        {vodStatus === 'ok' && vodSnap && (
          <>
            <p className="muted fmcw-intro-vod__meta">
              {vodSnap.fmcw.meta.representationNote}
            </p>
            <p className="muted fmcw-intro-vod__meta">{vodSnap.fmcw.meta.vodReferenceNote}</p>
            {vodSnap.fmcw.meta.liveRun?.ok ? (
              <p className="fmcw-intro-vod__chip-row">
                <span className="fmcw-intro-vod__chip fmcw-intro-vod__chip--live">
                  파이프라인 OK · 프레임 {vodSnap.fmcw.meta.liveRun.frameId ?? '—'} ·{' '}
                  {vodSnap.fmcw.meta.liveRun.inferMs ?? '—'} ms
                </span>
              </p>
            ) : vodSnap.fmcw.meta.liveRun && !vodSnap.fmcw.meta.liveRun.ok ? (
              <p className="muted fmcw-intro-vod__status" title={vodSnap.fmcw.meta.liveRun.error}>
                live 추론 실패 — 서버 로그·VoD 경로를 확인하세요.
              </p>
            ) : null}

            {hasVodBody ? (
              <>
                {insights?.conclusionBullets && insights.conclusionBullets.length > 0 && (
                  <div className="fmcw-intro-vod__bullets">
                    <h4 className="fmcw-intro-vod__h4">획득·부가 설명</h4>
                    <ul>
                      {insights.conclusionBullets.map((line, i) => (
                        <li key={`vod-b-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="fmcw-intro-vod__split">
                  <div className="fmcw-intro-vod__pane">
                    <p className="fmcw-intro-vod__cap">카메라 (YOLO 오버레이, 동기 프레임)</p>
                    {insights?.annotatedImageBase64 ? (
                      <img
                        src={`data:image/jpeg;base64,${insights.annotatedImageBase64}`}
                        alt="VoD 동기 프레임 YOLO 오버레이"
                        className="fmcw-intro-vod__img"
                      />
                    ) : (
                      <p className="muted fmcw-intro-vod__placeholder">오버레이 이미지 없음</p>
                    )}
                    {insights?.primaryObject ? (
                      <p className="muted fmcw-intro-vod__sub">
                        주요 객체: <strong>{insights.primaryObject.label}</strong> · 신뢰도{' '}
                        {(insights.primaryObject.confidence * 100).toFixed(1)}%
                      </p>
                    ) : null}
                  </div>
                  <div className="fmcw-intro-vod__pane">
                    <p className="fmcw-intro-vod__cap">동기 시점 메모</p>
                    {insights?.syncedViewNote ? (
                      <p className="fmcw-intro-vod__note">{insights.syncedViewNote}</p>
                    ) : (
                      <p className="muted fmcw-intro-vod__placeholder">동기 시점 메모 없음</p>
                    )}
                    {insights?.lidarReviewParagraph ? (
                      <div className="fmcw-intro-vod__lidar">
                        <h4 className="fmcw-intro-vod__h4">LiDAR 검토 문단</h4>
                        <p className="fmcw-intro-vod__lidar-body">{insights.lidarReviewParagraph}</p>
                      </div>
                    ) : null}
                    {insights?.lidarValidation &&
                    (insights.lidarValidation.pointsInRoi ?? 0) > 0 ? (
                      <ul className="muted fmcw-intro-vod__lidar-stats">
                        <li>
                          ROI 점: <strong>{insights.lidarValidation.pointsInRoi}</strong>
                        </li>
                        <li>
                          Δ거리: <strong>{insights.lidarValidation.deltaRangeM ?? '—'} m</strong>
                        </li>
                        <li>
                          Δ방위: <strong>{insights.lidarValidation.deltaBearingDeg ?? '—'}°</strong>
                        </li>
                        <li>
                          판정: <strong>{insights.lidarValidation.verdict ?? '—'}</strong>
                        </li>
                      </ul>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="muted fmcw-intro-vod__status">
                이번 응답에 VoD insights 필드가 비어 있습니다. 레이더 탐지 {vodSnap.fmcw.detections.length}개 — 통합
                상황 화면에서 지도·차트로 확인하거나, 서버 VoD 설정을 점검하세요.
              </p>
            )}
          </>
        )}
      </section>

      <div className="fmcw-intro-viz">
        <div className="fmcw-intro-viz__block fmcw-intro-viz__block--wide">
          <p className="fmcw-intro-viz__label">2D Range–Azimuth</p>
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: 12 }}>
            VoD 경로에 따라 3D 포인트 추출·표시가 생략될 수 있습니다.
          </p>
          <RadarCharts2D detections={FMCW_INTRO_DETECTIONS} />
        </div>
      </div>
    </SensorPageLayout>
  )
}
