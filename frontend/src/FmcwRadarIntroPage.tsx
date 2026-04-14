import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { RadarCharts2D } from './RadarCharts2D'
import { FMCW_INTRO_DETECTIONS } from './fmcwIntroDemoData'
import { SensorStagePipelineFrame } from './SensorStagePipelineFrame'
import { getApiBaseUrl } from './apiBaseUrl'

/** FMCW 단독 운용 콘솔 기준 단계(레이더 → 웹 JSON) */
const FMCW_CONSOLE_PIPELINE_STEPS: readonly { step: string; title: string; body: string }[] = [
  {
    step: '1/6',
    title: '프레임 수집',
    body: 'VoD 레이더 바이너리 한 틱(radar) 또는 짧은 스택(radar_3frames / radar_5frames)을 적재합니다. 운용 파이프라인은 레이더만으로 닫습니다.',
  },
  {
    step: '2/6',
    title: '전처리 · 군집',
    body: '유효 점 필터 후 DBSCAN으로 공간상 응집된 후보(target / unknown target)를 만듭니다. 후보별 candidate confidence로 저신뢰를 걸러 냅니다.',
  },
  {
    step: '3/6',
    title: '추적',
    body: 'Kalman(상수속도) 예측과 헝가리안 매칭으로 트랙 ID를 유지합니다. 트랙 신뢰도(track confidence)는 검출 신뢰도와 별도로 관리합니다.',
  },
  {
    step: '4/6',
    title: '단기 예측 · 위험도',
    body: '1·2·3초 horizon으로 궤적을 외삽하고, 거리·접근 속도·자산 방향·안정도·신뢰도로 위험 점수를 산출합니다.',
  },
  {
    step: '5/6',
    title: '위험 구역',
    body: '예측 경로 주변에 버퍼 코리도(폴리곤)를 생성해 조기 경보·지도 오버레이에 넘깁니다.',
  },
  {
    step: '6/6',
    title: '웹 페이로드',
    body: '탐지·트랙·예측·danger zone을 단일 JSON(WebPayload)으로보냅니다. FastAPI 서비스(radar-service) 또는 백엔드가 동일 스키마로 소비합니다.',
  },
] as const

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
  const liveRun = vodSnap?.fmcw.meta.liveRun
  const showInsightsPanel =
    insights &&
    ((insights.conclusionBullets && insights.conclusionBullets.length > 0) || insights.annotatedImageBase64)

  return (
    <SensorStagePipelineFrame
      activeStep="fmcw"
      title="FMCW · VoD (근거리 레이더 운용)"
      lead={
        <>
          <strong>레이더 단독</strong>으로 탐지·추적·단기 예측·위험 구역까지 처리하는 운용 콘솔 화면입니다. VoD{' '}
          <strong>FMCW(3+1D)</strong> 포인트를 한 틱 단위로 수집하고, 웹·지도는{' '}
          <code>/map/radar/snapshot?source=live</code> 요약 또는 <code>radar-service</code>의 WebPayload JSON을
          소비합니다. 객체 종류는 레이더만으로 단정하지 않으며 <strong>target / unknown target</strong> 중심으로
          표시합니다.
        </>
      }
      detailTitle="입력 · 처리 · 출력"
      detail={
        <>
          <ul className="drone-eoir-band-list">
            <li>
              <strong>입력</strong> — VoD 레이더 <code>.bin</code>(N×7: 위치·RCS·도플러·시간). 단일 프레임 또는
              3·5프레임 스택.
            </li>
            <li>
              <strong>처리</strong> — 전처리 → DBSCAN → 후보 점수화·필터 → Kalman + 헝가리안 추적 → 1/2/3초 궤적 예측
              → 위험도 → 예측 경로 주변 danger corridor.
            </li>
            <li>
              <strong>출력</strong> — WebPayload JSON(탐지·트랙·예측·위험 구역), 본 화면의 Range–Azimuth 운용 뷰·통합
              상황판 오버레이.
            </li>
          </ul>
          <p className="muted drone-eoir-footnote">
            최종 운용 파이프라인에서는 LiDAR 검증을 포함하지 않습니다. chirp 기반 거리·위상 기반 도플러/속도 해석은
            기존 VoD 관례를 따릅니다.
          </p>
        </>
      }
      demoTitle="운용 뷰 · Range–Azimuth (live 메타)"
      demoLead={
        <>
          거리–방위 평면에서 <strong>현재 탐지 분포</strong>를 한눈에 보는 콘솔 패널입니다. 백엔드가 live로 응답하면
          프레임·지연·포인트 수가 상단 칩에 표시됩니다.
        </>
      }
      demoWrapClassName="sensor-stage-demo-shell"
      demo={
        <>
          {vodStatus === 'loading' && (
            <p className="muted fmcw-intro-vod__status" style={{ padding: '12px 16px' }}>
              live 스냅샷 불러오는 중…
            </p>
          )}
          {vodStatus === 'error' && (
            <p className="muted fmcw-intro-vod__status" style={{ padding: '12px 16px' }}>
              백엔드에 연결할 수 없습니다. 차트는 로컬 데이터로 표시됩니다.
            </p>
          )}
          {vodStatus === 'ok' && vodSnap && liveRun?.ok ? (
            <p className="fmcw-intro-vod__chip-row" style={{ padding: '12px 16px 0' }}>
              <span className="fmcw-intro-vod__chip fmcw-intro-vod__chip--live">
                live OK · 프레임 {liveRun.frameId ?? '—'} · {liveRun.inferMs ?? '—'} ms
                {liveRun.radarPointCount != null ? ` · 점 ${liveRun.radarPointCount}` : ''}
              </span>
            </p>
          ) : null}
          {vodStatus === 'ok' && vodSnap && liveRun && !liveRun.ok ? (
            <p className="muted fmcw-intro-vod__status" style={{ padding: '12px 16px' }} title={liveRun.error}>
              live 추론 실패 — 서버·VoD 경로 확인.
            </p>
          ) : null}
          {vodStatus === 'ok' && vodSnap && liveRun?.radarPipeline ? (
            <p className="muted" style={{ padding: '0 16px 8px', fontSize: 12 }}>
              파이프라인: <code>{liveRun.radarPipeline}</code>
            </p>
          ) : null}
          <div className="fmcw-intro-viz__block fmcw-intro-viz__block--wide" style={{ padding: '8px 12px 16px' }}>
            <RadarCharts2D detections={FMCW_INTRO_DETECTIONS} />
          </div>
        </>
      }
      actions={
        <NavLink to="/sensor-pipeline?step=fmcw" className="btn-secondary">
          센서 파이프라인 3단계
        </NavLink>
      }
      belowDemo={
        <>
          <section className="fmcw-pipeline-flow" aria-labelledby="fmcw-pipeline-h">
        <h3 id="fmcw-pipeline-h" className="fmcw-pipeline-flow__title">
          운용 파이프라인(레이더 단독)
        </h3>
        <p className="muted fmcw-pipeline-flow__ref">
          구현은 저장소 <code>radar-service/app/</code> 모듈로 분리되어 있으며, 노트북은 검증용 경량 실행만
          담당합니다.
        </p>
        <ol className="fmcw-pipeline-flow__list">
          {FMCW_CONSOLE_PIPELINE_STEPS.map((row) => (
            <li key={row.step + row.title} className="fmcw-pipeline-flow__item">
              <div className="fmcw-pipeline-flow__badge" aria-hidden>
                {row.step}
              </div>
              <div className="fmcw-pipeline-flow__body">
                <h4 className="fmcw-pipeline-flow__item-title">{row.title}</h4>
                <p className="fmcw-pipeline-flow__item-text">{row.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="fmcw-intro-vod" aria-label="live 스냅샷으로 콘솔 레이어 채우기">
        <h3 className="fmcw-intro-vod__title">현장 연동 — live 스냅샷</h3>
        <p className="muted fmcw-intro-vod__lead">
          <code>GET /map/radar/snapshot?source=live</code>로 동일 틱의 처리 상태·탐지 건수·요약 문구를 가져옵니다.
          아래는 <strong>틱 메타 → 탐지 요약 → (선택) 참고 영상</strong> 순으로 배치했습니다.
        </p>

        {vodStatus === 'loading' && (
          <p className="muted fmcw-intro-vod__status">live 스냅샷 불러오는 중…</p>
        )}
        {vodStatus === 'error' && (
          <p className="muted fmcw-intro-vod__status">
            백엔드에 연결할 수 없습니다. 상단 차트는 로컬 데이터로 동작합니다. 서버를 켠 뒤 새로고침하거나 통합
            상황으로 진행하세요.
          </p>
        )}

        {vodStatus === 'ok' && vodSnap && (
          <>
            <p className="muted fmcw-intro-vod__meta">{vodSnap.fmcw.meta.representationNote}</p>
            <p className="muted fmcw-intro-vod__meta">{vodSnap.fmcw.meta.vodReferenceNote}</p>

            <div className="fmcw-console-layer">
              <p className="fmcw-console-layer__label">
                <span className="fmcw-console-layer__step">1/4</span> 틱 · 서버 메타
              </p>
              {liveRun?.ok ? (
                <p className="fmcw-intro-vod__chip-row">
                  <span className="fmcw-intro-vod__chip fmcw-intro-vod__chip--live">
                    파이프라인 OK · 프레임 {liveRun.frameId ?? '—'} · {liveRun.inferMs ?? '—'} ms
                    {liveRun.radarPointCount != null ? ` · 점 ${liveRun.radarPointCount}` : ''}
                  </span>
                </p>
              ) : liveRun && !liveRun.ok ? (
                <p className="muted fmcw-intro-vod__status" title={liveRun.error}>
                  live 추론 실패 — 서버 로그·VoD 경로를 확인하세요.
                </p>
              ) : null}
              {liveRun?.radarPipeline ? (
                <p className="muted fmcw-console-layer__sub">
                  서버 파이프라인 문자열: <code>{liveRun.radarPipeline}</code>
                </p>
              ) : null}
            </div>

            <div className="fmcw-console-layer fmcw-console-layer--detections">
              <p className="fmcw-console-layer__label">
                <span className="fmcw-console-layer__step">2/4</span> 탐지·트랙 요약
              </p>
              <p className="muted fmcw-console-layer__sub">
                현재 스냅샷 탐지 <strong>{vodSnap.fmcw.detections.length}</strong>건 — 통합 상황판 마커·표와 연동됩니다.
              </p>
            </div>

            {showInsightsPanel ? (
              <>
                {insights?.conclusionBullets && insights.conclusionBullets.length > 0 && (
                  <div className="fmcw-intro-vod__bullets">
                    <h4 className="fmcw-intro-vod__h4">
                      <span className="fmcw-console-layer__step fmcw-console-layer__step--inline">3/4</span> 서버 요약
                    </h4>
                    <ul>
                      {insights.conclusionBullets.map((line, i) => (
                        <li key={`vod-b-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="fmcw-intro-vod__pane fmcw-console-layer" style={{ marginTop: 12 }}>
                  <p className="fmcw-intro-vod__cap">
                    <span className="fmcw-console-layer__step fmcw-console-layer__step--inline">4/4</span> 참고 영상
                    (연동 시)
                  </p>
                  <p className="muted fmcw-intro-vod__sub" style={{ marginBottom: 8 }}>
                    레이더 단독 운용에서는 필수가 아닙니다. 백엔드가 광학 오버레이를 포함해 응답할 때만 표시됩니다.
                  </p>
                  {insights?.annotatedImageBase64 ? (
                    <img
                      src={`data:image/jpeg;base64,${insights.annotatedImageBase64}`}
                      alt="동기 프레임 참고 영상"
                      className="fmcw-intro-vod__img"
                    />
                  ) : (
                    <p className="muted fmcw-intro-vod__placeholder">참고 영상 없음</p>
                  )}
                  {insights?.primaryObject ? (
                    <p className="muted fmcw-intro-vod__sub">
                      참고 라벨: <strong>{insights.primaryObject.label}</strong> · 신뢰도{' '}
                      {(insights.primaryObject.confidence * 100).toFixed(1)}%
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="muted fmcw-intro-vod__status">
                이번 응답에 요약·참고 영상 필드가 비어 있습니다. 탐지 건수와 상단 Range–Azimuth 뷰로 레이더 층을
                확인하거나 서버 VoD 설정을 점검하세요.
              </p>
            )}
          </>
        )}
      </section>
        </>
      }
      nextStep={{ label: '4단계: 드론 EO/IR 식별', onContinue }}
    />
  )
}
