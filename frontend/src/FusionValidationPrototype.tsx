import { useCallback, useEffect, useMemo, useState } from 'react'
import { RadarCharts2D, type RadarDetectionPoint } from './RadarCharts2D'
import {
  DEMO_FMCW_DETECTIONS,
  DEMO_LIDAR_VALIDATION,
  DEMO_MODEL_META,
} from './fusionValidationDemo'
import { getApiBaseUrl } from './apiBaseUrl'

type Phase = 'idle' | 'infer' | 'radar' | 'lidar' | 'done'

const PHASE_ORDER: Phase[] = ['idle', 'infer', 'radar', 'lidar', 'done']

const primaryDet = DEMO_FMCW_DETECTIONS[0]!

type VodFusionResponse = {
  ok?: boolean
  inferMs?: number
  radarPointCount?: number
  radarPipeline?: string
  yoloModel?: string
  radarDetections?: Array<{
    id: string
    rangeM: number
    azimuthDeg: number
    elevationDeg: number
    dopplerMps: number
    confidence: number
    clusterSize?: number
    centroidM?: number[]
  }>
  yoloDetections?: Array<{ label: string; confidence: number; bbox: number[] }>
  annotatedImageBase64?: string | null
  lidarValidation?: {
    matched?: boolean
    pointsInRoi?: number
    meanDistanceM?: number | null
    primaryClusterId?: string
    radiusM?: number
    lidarClusterRangeM?: number | null
    radarRangeM?: number | null
    deltaRangeM?: number | null
    deltaBearingDeg?: number | null
    lidarClusterAzimuthDeg?: number | null
    iouBevProxy?: number
    verdict?: string
  } | null
  autoFrameId?: string
  autoDatasetRoot?: string
  autoSyncedFrameCount?: number
}

function mapServerRadarToChart(
  list: NonNullable<VodFusionResponse['radarDetections']>,
): RadarDetectionPoint[] {
  return list.map((d) => ({
    id: d.id,
    rangeM: d.rangeM,
    azimuthDeg: d.azimuthDeg,
    elevationDeg: d.elevationDeg,
    dopplerMps: d.dopplerMps,
    confidence: d.confidence,
  }))
}

export function FusionValidationPrototype() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [inferProgress, setInferProgress] = useState(0)
  const [logLines, setLogLines] = useState<string[]>([])

  const [radarFile, setRadarFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [lidarFile, setLidarFile] = useState<File | null>(null)
  const [realLoading, setRealLoading] = useState(false)
  const [realError, setRealError] = useState<string | null>(null)
  const [realResult, setRealResult] = useState<VodFusionResponse | null>(null)

  const pushLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-12), `${new Date().toLocaleTimeString()}  ${line}`])
  }, [])

  useEffect(() => {
    if (phase !== 'infer') {
      setInferProgress(0)
      return undefined
    }
    let p = 0
    const id = window.setInterval(() => {
      p += 8 + Math.random() * 12
      if (p >= 100) {
        p = 100
        window.clearInterval(id)
        setPhase('radar')
        pushLog('추론 완료 · 탐지 후보 3개 (NMS 적용)')
      }
      setInferProgress(Math.min(100, Math.round(p)))
    }, 160)
    return () => window.clearInterval(id)
  }, [phase, pushLog])

  useEffect(() => {
    if (phase === 'infer') {
      pushLog(`체크포인트 로드: ${DEMO_MODEL_META.checkpoint}`)
    }
    if (phase === 'radar') {
      const r0 = realResult?.radarDetections?.[0]
      if (r0) {
        pushLog(
          `FMCW(실제): range=${r0.rangeM}m · az=${r0.azimuthDeg}° · conf=${r0.confidence} · 프레임 ${realResult?.autoFrameId ?? '업로드'}`,
        )
      } else {
        pushLog(
          `FMCW: 우선 표적 range=${(primaryDet.rangeM / 1000).toFixed(2)}km az=${primaryDet.azimuthDeg}° conf=${primaryDet.confidence}`,
        )
      }
    }
    if (phase === 'lidar') {
      const lv = realResult?.lidarValidation
      if (lv && (lv.pointsInRoi ?? 0) > 0) {
        pushLog(
          `LiDAR(실제): ROI 점 ${lv.pointsInRoi}개 · Δ거리 ${lv.deltaRangeM ?? '—'}m · 판정 ${lv.verdict ?? '—'}`,
        )
      } else {
        pushLog(
          `LiDAR: 점 ${DEMO_LIDAR_VALIDATION.numPointsInRoi}개 · BEV IoU proxy ${DEMO_LIDAR_VALIDATION.iouBevProxy}`,
        )
      }
    }
    if (phase === 'done') {
      if (realResult) {
        pushLog(
          `교차검증 완료(실제): LiDAR ${realResult.lidarValidation?.verdict ?? '데이터 없음'} · 레이더 후보 ${realResult.radarDetections?.length ?? 0}개`,
        )
      } else {
        pushLog('교차검증: 레이더·LiDAR 불일치 없음 → 표적 유지')
      }
    }
  }, [phase, realResult, pushLog])

  const runDemo = () => {
    setRealResult(null)
    setLogLines([])
    setPhase('infer')
    pushLog('배치 구성: 레이더 스캔 1프레임 + 캘리브 (LiDAR는 검증 단계에서 병합)')
  }

  const runRealInference = async () => {
    if (!radarFile) {
      setRealError('레이더 .bin 파일을 선택하세요.')
      return
    }
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setRealError('로그인 후 사용할 수 있습니다. (JWT 필요)')
      return
    }
    setRealError(null)
    setRealResult(null)
    setRealLoading(true)
    try {
      const fd = new FormData()
      fd.append('radar', radarFile)
      if (imageFile) fd.append('image', imageFile)
      if (lidarFile) fd.append('lidar', lidarFile)

      const res = await fetch(`${getApiBaseUrl()}/ai/vod/radar-fusion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as VodFusionResponse & { message?: string }
      if (!res.ok) {
        throw new Error(
          typeof data.message === 'string' ? data.message : `HTTP ${res.status}`,
        )
      }
      setRealResult(data)
      setPhase('radar')
      setInferProgress(100)
    } catch (e) {
      setRealError(e instanceof Error ? e.message : '요청 실패')
    } finally {
      setRealLoading(false)
    }
  }

  /** 서버 디스크의 VoD 폴더에서 이미지·레이더 stem이 맞는 프레임만 모아 임의 1개 선택 */
  const runAutoDatasetInference = async (seed?: number) => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setRealError('로그인 후 사용할 수 있습니다. (JWT 필요)')
      return
    }
    setRealError(null)
    setRealResult(null)
    setRealLoading(true)
    try {
      const res = await fetch(`${getApiBaseUrl()}/ai/vod/radar-fusion/auto`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(seed !== undefined ? { seed } : {}),
      })
      const data = (await res.json().catch(() => ({}))) as VodFusionResponse & { message?: string }
      if (!res.ok) {
        throw new Error(
          typeof data.message === 'string' ? data.message : `HTTP ${res.status}`,
        )
      }
      setRealResult(data)
      setPhase('radar')
      setInferProgress(100)
    } catch (e) {
      setRealError(e instanceof Error ? e.message : '요청 실패')
    } finally {
      setRealLoading(false)
    }
  }

  const realChartDetections = useMemo(() => {
    if (!realResult?.radarDetections?.length) return null
    return mapServerRadarToChart(realResult.radarDetections)
  }, [realResult])

  const useRealFmcwPanels = Boolean(
    realResult?.radarDetections && realResult.radarDetections.length > 0,
  )
  const realFmcwChart = useRealFmcwPanels ? mapServerRadarToChart(realResult!.radarDetections!) : null
  const primaryRealId = realResult?.radarDetections?.[0]?.id

  const realLidarMetrics = realResult?.lidarValidation
  const useRealLidarPanel = Boolean(
    realLidarMetrics &&
      (realLidarMetrics.lidarClusterRangeM != null ||
        realLidarMetrics.deltaRangeM != null ||
        (realLidarMetrics.pointsInRoi != null && realLidarMetrics.pointsInRoi > 0)),
  )

  const stepClass = (p: Phase) => {
    const idx = PHASE_ORDER.indexOf(phase)
    const j = PHASE_ORDER.indexOf(p)
    if (j < idx) return 'fusion-proto-step fusion-proto-step--done'
    if (j === idx) return 'fusion-proto-step fusion-proto-step--active'
    return 'fusion-proto-step'
  }

  return (
    <section className="page fusion-proto-page">
      <header className="fusion-proto-head">
        <div>
          <h1>FMCW 탐지 · LiDAR 검증</h1>
          <p className="muted fusion-proto-lead">
            <strong>실제 추론</strong>은 VoD 형식 <strong>레이더 .bin</strong>을 Python(FastAPI)에서 처리합니다
            (DBSCAN 클러스터). 이미지를 함께내면 <strong>YOLOv8</strong> 검출이 실행되고, 같은 프레임{' '}
            <strong>LiDAR .bin</strong>을 넣으면 1위 레이더 클러스터 주변 점 수로 <strong>검증</strong>합니다. 상단{' '}
            상단 <strong>단계 진행</strong>으로 처리 흐름을 넘길 수 있습니다.
          </p>
        </div>
        <div className="fusion-proto-actions">
          <button type="button" className="btn-primary" onClick={runDemo} disabled={phase === 'infer'}>
            {phase === 'infer' ? '추론 중…' : '단계 진행'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setPhase('idle')
              setInferProgress(0)
              setLogLines([])
            }}
          >
            초기화
          </button>
        </div>
      </header>

      <article className="fusion-proto-card fusion-proto-card--wide fusion-proto-card--real">
        <h2 className="fusion-proto-card-title">실제 추론 (백엔드 → Python AI 서버)</h2>
        <p className="muted fusion-proto-card-hint">
          1) <code>ai-inference</code>에서 <code>uvicorn main:app --port 8001</code> 실행 · 2) Nest{' '}
          <code>AI_INFERENCE_URL=http://localhost:8001</code> · 3) 로그인 후{' '}
          <strong>임의 프레임</strong>(서버 로컬 VoD 폴더) 또는 파일 직접 선택 · 4){' '}
          <strong>실제 추론 실행</strong>
          <br />
          자동 선택 데이터 루트: 환경변수 <code>VOD_DATASET_ROOT</code> 없으면{' '}
          <code className="fusion-proto-mono">../vod-devkit/vod-received/view_of_delft_PUBLIC</code> 를 사용합니다.
        </p>
        <div className="fusion-proto-upload-grid">
          <label className="fusion-proto-file-label">
            레이더 필수 (.bin)
            <input
              type="file"
              accept=".bin,application/octet-stream"
              onChange={(e) => setRadarFile(e.target.files?.[0] ?? null)}
            />
            <span className="fusion-proto-file-name">{radarFile?.name ?? '선택 없음'}</span>
          </label>
          <label className="fusion-proto-file-label">
            카메라 선택 (.jpg)
            <input
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <span className="fusion-proto-file-name">{imageFile?.name ?? '선택 없음'}</span>
          </label>
          <label className="fusion-proto-file-label">
            LiDAR 선택 (.bin, 검증)
            <input
              type="file"
              accept=".bin,application/octet-stream"
              onChange={(e) => setLidarFile(e.target.files?.[0] ?? null)}
            />
            <span className="fusion-proto-file-name">{lidarFile?.name ?? '선택 없음'}</span>
          </label>
        </div>
        <div className="fusion-proto-real-actions fusion-proto-real-actions--row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void runAutoDatasetInference()}
            disabled={realLoading}
            title="동기화된 jpg+bin 프레임 목록에서 무작위 1개"
          >
            {realLoading ? '추론 중…' : '로컬 데이터에서 임의 1프레임 추론'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void runRealInference()}
            disabled={realLoading || !radarFile}
          >
            {realLoading ? '추론 중…' : '선택 파일로 추론 실행'}
          </button>
        </div>
        {realError && <p className="error fusion-proto-real-err">{realError}</p>}
        {realResult && (
          <div className="fusion-proto-real-out">
            <p className="fusion-proto-real-meta">
              <strong>{realResult.inferMs ?? '—'} ms</strong> · 레이더 점{' '}
              <strong>{realResult.radarPointCount ?? '—'}</strong> · 파이프라인{' '}
              <span className="fusion-proto-mono">{realResult.radarPipeline}</span> · YOLO{' '}
              <span className="fusion-proto-mono">{realResult.yoloModel}</span>
              {realResult.autoFrameId != null && (
                <>
                  <br />
                  <span className="fusion-proto-mono">
                    자동 프레임: {realResult.autoFrameId}
                  </span>
                  {realResult.autoSyncedFrameCount != null && (
                    <> · 동기 프레임 풀 {realResult.autoSyncedFrameCount}개</>
                  )}
                </>
              )}
            </p>
            {realChartDetections && realChartDetections.length > 0 && (
              <div className="fusion-proto-charts fusion-proto-charts--2d-only">
                <div className="fusion-proto-chart-block fusion-proto-chart-block--wide">
                  <p className="fusion-proto-viz-cap">Range–Azimuth (VoD는 2D만 표시)</p>
                  <RadarCharts2D detections={realChartDetections} />
                </div>
              </div>
            )}
            {realResult.annotatedImageBase64 && (
              <div className="fusion-proto-yolo-img">
                <p className="fusion-proto-viz-cap">YOLO 검출 오버레이</p>
                <img
                  src={`data:image/jpeg;base64,${realResult.annotatedImageBase64}`}
                  alt="YOLO 결과"
                  className="fusion-proto-yolo-img-el"
                />
              </div>
            )}
            {realResult.lidarValidation && (
              <dl className="fusion-proto-dl fusion-proto-dl--lidar">
                <div>
                  <dt>LiDAR 검증</dt>
                  <dd>
                    {realResult.lidarValidation.verdict ??
                      (realResult.lidarValidation.matched ? '일치(점 수 기준)' : '불충분/불일치')}{' '}
                    · ROI 점 {realResult.lidarValidation.pointsInRoi ?? '—'} · Δ거리{' '}
                    {realResult.lidarValidation.deltaRangeM ?? '—'} m · 방위차{' '}
                    {realResult.lidarValidation.deltaBearingDeg ?? '—'}° · BEV proxy{' '}
                    {realResult.lidarValidation.iouBevProxy ?? '—'}
                  </dd>
                </div>
              </dl>
            )}
            {realResult.yoloDetections && realResult.yoloDetections.length > 0 && (
              <ul className="fusion-proto-yolo-list">
                {realResult.yoloDetections.slice(0, 8).map((y, i) => (
                  <li key={`${y.label}-${i}`}>
                    {y.label} · {(y.confidence * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </article>

      <ol className="fusion-proto-timeline" aria-label="처리 단계">
        <li className={stepClass('idle')}>
          <span className="fusion-proto-step-num">0</span>
          <div>
            <strong>대기</strong>
            <p className="muted">단계 진행으로 파이프라인 시작</p>
          </div>
        </li>
        <li className={stepClass('infer')}>
          <span className="fusion-proto-step-num">1</span>
          <div>
            <strong>모델 추론</strong>
            <p className="muted">FMCW BEV/포인트 검출기 순전파</p>
          </div>
        </li>
        <li className={stepClass('radar')}>
          <span className="fusion-proto-step-num">2</span>
          <div>
            <strong>FMCW 탐지</strong>
            <p className="muted">적 후보 박스·신뢰도·도플러</p>
          </div>
        </li>
        <li className={stepClass('lidar')}>
          <span className="fusion-proto-step-num">3</span>
          <div>
            <strong>LiDAR 검증</strong>
            <p className="muted">동일 시각 윈도우에서 클러스터 정합</p>
          </div>
        </li>
        <li className={stepClass('done')}>
          <span className="fusion-proto-step-num">4</span>
          <div>
            <strong>판정</strong>
            <p className="muted">레이더·LiDAR 교차 확인 요약</p>
          </div>
        </li>
      </ol>

      <div className="fusion-proto-grid">
        <article className="fusion-proto-card">
          <h2 className="fusion-proto-card-title">1) 모델 추론 상태</h2>
          {phase === 'infer' ? (
            <>
              <div className="fusion-proto-progress">
                <div className="fusion-proto-progress-bar" style={{ width: `${inferProgress}%` }} />
              </div>
              <p className="fusion-proto-progress-label">{inferProgress}% · GPU 순전파</p>
            </>
          ) : phase === 'idle' ? (
            <p className="muted">
              <strong>단계 진행</strong> 또는 <strong>실제 추론</strong>으로 시작합니다. 실제 추론 후에는 아래 버튼으로
              LiDAR·판정 단계를 이어갈 수 있습니다.
            </p>
          ) : (
            <p className="fusion-proto-ok">
              완료 · {realResult?.inferMs ?? DEMO_MODEL_META.inferMs} ms
              {realResult?.autoFrameId != null && (
                <>
                  {' '}
                  · 프레임 <span className="fusion-proto-mono">{realResult.autoFrameId}</span>
                </>
              )}
            </p>
          )}
          <dl className="fusion-proto-dl">
            <div>
              <dt>모델</dt>
              <dd>{realResult?.yoloModel ?? DEMO_MODEL_META.name}</dd>
            </div>
            <div>
              <dt>체크포인트 / 파이프라인</dt>
              <dd className="fusion-proto-mono">
                {realResult?.radarPipeline ?? DEMO_MODEL_META.checkpoint}
              </dd>
            </div>
            <div>
              <dt>프레임</dt>
              <dd>{realResult?.autoFrameId ?? DEMO_MODEL_META.frameId}</dd>
            </div>
            <div>
              <dt>환경</dt>
              <dd>{realResult ? 'Python AI + Nest 프록시' : DEMO_MODEL_META.device}</dd>
            </div>
          </dl>
        </article>

        <article className="fusion-proto-card fusion-proto-card--log">
          <h2 className="fusion-proto-card-title">실행 로그</h2>
          <pre className="fusion-proto-pre" aria-live="polite">
            {logLines.length === 0 ? '로그가 여기에 쌓입니다.' : logLines.join('\n')}
          </pre>
        </article>

        <article className="fusion-proto-card fusion-proto-card--wide">
          <h2 className="fusion-proto-card-title">2) FMCW 레이더 — 탐지 결과</h2>
          <p className="muted fusion-proto-card-hint">
            {useRealFmcwPanels ? (
              <>
                <strong>실제 추론</strong> 결과 (DBSCAN 클러스터). 붉은 강조:{' '}
                <strong>우선 표적(1위 신뢰도)</strong>.
              </>
            ) : (
              <>상단 <strong>실제 추론</strong>을 실행하면 동일 레이아웃에 서버 탐지가 표시됩니다.</>
            )}
          </p>
          <div className="fusion-proto-charts fusion-proto-charts--2d-only">
            <div className="fusion-proto-chart-block fusion-proto-chart-block--wide">
              <p className="fusion-proto-viz-cap">Range–Azimuth · {useRealFmcwPanels ? '실제 추론' : '보조 표시'}</p>
              <RadarCharts2D
                detections={useRealFmcwPanels && realFmcwChart ? realFmcwChart : DEMO_FMCW_DETECTIONS}
              />
            </div>
          </div>
          <table className="fusion-proto-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>거리(m)</th>
                <th>방위°</th>
                <th>도플러</th>
                <th>신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {useRealFmcwPanels && realResult?.radarDetections
                ? realResult.radarDetections.map((d) => (
                    <tr
                      key={d.id}
                      className={d.id === primaryRealId ? 'fusion-proto-table-row--primary' : ''}
                    >
                      <td>{d.id}</td>
                      <td>{d.rangeM}</td>
                      <td>{d.azimuthDeg.toFixed(1)}</td>
                      <td>{d.dopplerMps.toFixed(2)}</td>
                      <td>{d.confidence.toFixed(2)}</td>
                    </tr>
                  ))
                : DEMO_FMCW_DETECTIONS.map((d) => (
                    <tr key={d.id} className={d.id === 'tgt-primary' ? 'fusion-proto-table-row--primary' : ''}>
                      <td>{d.id}</td>
                      <td>{d.rangeM}</td>
                      <td>{d.azimuthDeg.toFixed(1)}</td>
                      <td>{d.dopplerMps.toFixed(2)}</td>
                      <td>{d.confidence.toFixed(2)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </article>

        <article className="fusion-proto-card fusion-proto-card--wide">
          <h2 className="fusion-proto-card-title">3) LiDAR — 기하·밀도 검증</h2>
          <p className="muted fusion-proto-card-hint">
            레이더 1차 탐지를 기준으로 <strong>동기 LiDAR</strong> ROI에서 거리·방위를 비교합니다.
            {useRealLidarPanel ? (
              <> 우측 수치는 <strong>실제 추론</strong> 응답입니다.</>
            ) : (
              <> BEV는 단계 진행에 맞춰 갱신됩니다.</>
            )}
          </p>
          <div className="fusion-proto-bev-wrap">
            <LidarBevMock phase={phase} />
            <ul className="fusion-proto-metrics">
              <li>
                <span>LiDAR 클러스터 거리</span>
                <strong>
                  {useRealLidarPanel && realLidarMetrics?.lidarClusterRangeM != null
                    ? `${realLidarMetrics.lidarClusterRangeM} m`
                    : `${DEMO_LIDAR_VALIDATION.clusterRangeM} m`}
                </strong>
              </li>
              <li>
                <span>레이더 대비 Δ거리</span>
                <strong>
                  {useRealLidarPanel && realLidarMetrics?.deltaRangeM != null
                    ? `${realLidarMetrics.deltaRangeM} m`
                    : `${DEMO_LIDAR_VALIDATION.deltaRangeM} m`}
                </strong>
              </li>
              <li>
                <span>방위 차이</span>
                <strong>
                  {useRealLidarPanel && realLidarMetrics?.deltaBearingDeg != null
                    ? `${realLidarMetrics.deltaBearingDeg}°`
                    : `${DEMO_LIDAR_VALIDATION.deltaBearingDeg}°`}
                </strong>
              </li>
              <li>
                <span>ROI 내 점 수</span>
                <strong>
                  {useRealLidarPanel && realLidarMetrics?.pointsInRoi != null
                    ? realLidarMetrics.pointsInRoi
                    : DEMO_LIDAR_VALIDATION.numPointsInRoi}
                </strong>
              </li>
              <li>
                <span>BEV 정합 (proxy)</span>
                <strong>
                  {useRealLidarPanel && realLidarMetrics?.iouBevProxy != null
                    ? realLidarMetrics.iouBevProxy
                    : DEMO_LIDAR_VALIDATION.iouBevProxy}
                </strong>
              </li>
              <li>
                <span>판정</span>
                <strong className="fusion-proto-verdict">
                  {useRealLidarPanel && realLidarMetrics?.verdict
                    ? realLidarMetrics.verdict
                    : DEMO_LIDAR_VALIDATION.verdict}
                </strong>
              </li>
            </ul>
          </div>
        </article>

      </div>

      {(phase === 'radar' || phase === 'lidar' || phase === 'done') && (
        <div className="fusion-proto-fab">
          {phase === 'radar' && (
            <button type="button" className="btn-primary" onClick={() => setPhase('lidar')}>
              LiDAR 검증 단계로 →
            </button>
          )}
          {phase === 'lidar' && (
            <button type="button" className="btn-primary" onClick={() => setPhase('done')}>
              최종 판정 보기 →
            </button>
          )}
          {phase === 'done' && (
            <p className="fusion-proto-done-msg">
              시나리오 완료: <strong>FMCW로 적 후보 탐지</strong> 후 <strong>LiDAR로 거리·방위 정합 확인</strong>.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function LidarBevMock({ phase }: { phase: Phase }) {
  const showLidar = phase === 'lidar' || phase === 'done'
  const showHighlight = phase === 'done'

  return (
    <div className="fusion-proto-bev" aria-label="LiDAR 조감도">
      <svg viewBox="0 0 420 260" className="fusion-proto-bev-svg" role="img">
        <defs>
          <radialGradient id="bevGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0)" />
          </radialGradient>
        </defs>
        <rect width="420" height="260" fill="#0f172a" rx="12" />
        <text x="210" y="22" fill="#94a3b8" fontSize="11" textAnchor="middle">
          LiDAR BEV · 차량 기준 상단 뷰
        </text>
        {/* ego */}
        <polygon points="210,200 204,218 216,218" fill="#facc15" stroke="#854d0e" strokeWidth="1.5" />
        <text x="210" y="235" fill="#cbd5e1" fontSize="10" textAnchor="middle">
          ego
        </text>
        {/* radar bearing */}
        <line x1="210" y1="208" x2="310" y2="88" stroke="rgba(167,139,250,0.85)" strokeWidth="2" strokeDasharray="6 4" />
        <text x="318" y="82" fill="#c4b5fd" fontSize="9">
          FMCW 주시
        </text>
        {/* Lidar points cluster */}
        {showLidar &&
          Array.from({ length: 48 }, (_, i) => {
            const cx = 298 + (Math.sin(i * 1.7) * 14 + (i % 5) * 2)
            const cy = 92 + (Math.cos(i * 0.9) * 10 + (i % 3))
            return <circle key={i} cx={cx} cy={cy} r="2.2" fill="rgba(52,211,153,0.75)" />
          })}
        {/* BEV에서의 2D ROI 박스 */}
        {showLidar && (
          <rect
            x="275"
            y="72"
            width="56"
            height="36"
            fill="none"
            stroke="#34d399"
            strokeWidth="2"
            rx="4"
            opacity={0.95}
          />
        )}
        {showHighlight && (
          <rect x="8" y="8" width="404" height="244" fill="none" stroke="#22c55e" strokeWidth="2" rx={12} opacity={0.45} />
        )}
      </svg>
      {!showLidar && <p className="fusion-proto-bev-placeholder muted">LiDAR 검증 단계에서 포인트가 나타납니다.</p>}
    </div>
  )
}
