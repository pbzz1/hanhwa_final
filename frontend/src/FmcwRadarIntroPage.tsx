import { useEffect, useState } from 'react'
import { FmcwRadarScatter3D } from './FmcwRadarScatter3D'
import { RadarCharts2D } from './RadarCharts2D'
import { FMCW_INTRO_DETECTIONS } from './fmcwIntroDemoData'
import { SensorPageLayout } from './SensorPageLayout'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3308'

/** 4단계 VoD·live 스냅샷 표시에 필요한 최소 필드만 */
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
  const n = FMCW_INTRO_DETECTIONS.length
  const centroid = FMCW_INTRO_DETECTIONS.reduce(
    (a, d) => ({
      rangeM: a.rangeM + d.rangeM / n,
      azimuthDeg: a.azimuthDeg + d.azimuthDeg / n,
      elevationDeg: a.elevationDeg + d.elevationDeg / n,
    }),
    { rangeM: 0, azimuthDeg: 0, elevationDeg: 0 },
  )

  const [vodSnap, setVodSnap] = useState<IntroRadarSnapshot | null>(null)
  const [vodStatus, setVodStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    setVodStatus('loading')
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/map/radar/snapshot?source=live`)
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
      stepLabel="4"
      title="FMCW 레이더 (근거리 고해상) · VoD 정렬"
      lead={
        <>
          이 단계에서는 백엔드 <strong>VoD·live 스냅샷</strong>(<code>?source=live</code>)으로{' '}
          <strong>카메라 프레임·YOLO 오버레이·부가 설명</strong>을 보여 주고, 아래 고정 차트로{' '}
          <strong>range–azimuth·3D 점군</strong> 개념을 반복합니다. <strong>5단계 통합 시뮬</strong>에서는 같은
          이론을 지도에 올려 <strong>표적을 점으로 추정</strong>하고 <strong>어디서 어디로 이동하는지</strong>를
          방위·궤적으로 표시합니다.
        </>
      }
      modelTitle="모델·파이프라인 (개념)"
      modelBody={
        <>
          <p>
            송신 <strong>초당 주파수 변화(chirp)</strong>와 수신 혼합으로 <strong>비트 주파수 → 거리</strong>를
            얻고, chirp 간 <strong>위상 변화 → 도플러/속도</strong>를 추정합니다. 다중 chirp·MIMO로{' '}
            <strong>각도·고도</strong>를 보강할 수 있습니다.
          </p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            VoD 블록은 서버가 카메라·레이더 stem을 맞출 때만 풍성해집니다. API를 쓰지 못하면 안내 문구만 보이고,
            비교용 <strong>고정 데모</strong> 차트는 그대로 사용할 수 있습니다.
          </p>
        </>
      }
      inputItems={[
        'I/Q 또는 중간 주파수 샘플, chirp 타이밍',
        '파형 파라미터: 대역폭, chirp 기울기, 프레임 구조',
        '캘리브레이션: 위상 드리프트, 안테나 기준축',
        '트래킹·분류기(필터, ML) 입력 특성 벡터',
        'VoD 데모: 동기 카메라 .jpg + 레이더 .bin (백엔드 파이프라인)',
      ]}
      outputItems={[
        '탐지: range, azimuth, elevation, Doppler, phase',
        '트랙 상태: 위치·속도 공분산, 클래스 확률',
        '예측 경로(운동 모델) — 통합 시뮬 지도의 주황 점선과 동일 개념',
        '5단계: 지도상 점(펄스/FMCW)·C2→표적 방위·이동 방향(궤적 접선)',
      ]}
      continueLabel="통합 시뮬레이션으로"
      onContinue={onContinue}
    >
      <section className="fmcw-intro-vod" aria-label="VoD·live FMCW 스냅샷">
        <h3 className="fmcw-intro-vod__title">VoD 데이터 — 이미지·부가 설명</h3>
        {vodStatus === 'loading' && (
          <p className="muted fmcw-intro-vod__status">live 스냅샷 불러오는 중…</p>
        )}
        {vodStatus === 'error' && (
          <p className="muted fmcw-intro-vod__status">
            백엔드에 연결할 수 없습니다. 아래 <strong>고정 데모</strong> 차트로 개념을 확인한 뒤 통합 시뮬로
            진행하세요.
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
                      <p className="muted fmcw-intro-vod__placeholder">이번 스냅샷에 오버레이 이미지 없음</p>
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
                      <p className="muted fmcw-intro-vod__placeholder">syncedViewNote 없음</p>
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
                시뮬에서 지도·차트로 확인하거나, 서버 VoD 설정을 점검하세요.
              </p>
            )}
          </>
        )}
      </section>

      <div className="fmcw-intro-viz">
        <div className="fmcw-intro-viz__block">
          <p className="fmcw-intro-viz__label">2D Range–Azimuth (고정 데모 탐지)</p>
          <RadarCharts2D detections={FMCW_INTRO_DETECTIONS} />
        </div>
        <div className="fmcw-intro-viz__block">
          <p className="fmcw-intro-viz__label">3D 산점도 (탐지 평균, 모의)</p>
          <FmcwRadarScatter3D
            rangeM={centroid.rangeM}
            azimuthDeg={centroid.azimuthDeg}
            elevationDeg={centroid.elevationDeg}
            className="fmcw-intro-viz__scatter"
          />
        </div>
      </div>
    </SensorPageLayout>
  )
}
