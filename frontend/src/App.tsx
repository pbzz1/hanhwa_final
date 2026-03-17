import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import * as THREE from 'three'
import './App.css'

const API_BASE_URL = 'http://localhost:3308'

type User = {
  id: number
  email: string
  name: string | null
  createdAt: string
  updatedAt: string
}

type AuthResponse = {
  accessToken: string
  user: User
}

type LoginPageProps = {
  onLoggedIn: (payload: AuthResponse) => void
}

type SignupPageProps = {
  onSignedUp: (payload: AuthResponse) => void
}

type HomePageProps = {
  user: User | null
}

type AppLayoutProps = {
  user: User | null
  onLogout: () => void
}

type CameraDevice = {
  deviceId: string
  label: string
}

type YoloDetection = {
  label: string
  confidence: number
  bbox: [number, number, number, number]
  trackId: number | null
}

type YoloInferenceResponse = {
  source: string
  detections: YoloDetection[]
  annotatedImageBase64?: string
  message?: string
}

type VideoFrameResult = {
  frameIndex: number
  timestampSec: number
  detections: YoloDetection[]
}

type YoloVideoInferenceResponse = {
  source: string
  fps: number
  totalFrames: number
  sampledFrames: number
  totalDetections: number
  countsByLabel: Record<string, number>
  frameResults: VideoFrameResult[]
  previewFramesBase64: string[]
  message?: string
}

type Reconstruct3dMultiResponse = {
  sourceCount: number
  pairCount: number
  pointCount: number
  points3d: [number, number, number][]
  colorsRgb?: [number, number, number][]
  bounds: {
    x: [number, number]
    y: [number, number]
    z: [number, number]
  }
  ply?: {
    fileName?: string
    relativePath?: string | null
    downloadUrl?: string | null
    absolutePath?: string | null
  }
  message?: string
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : '요청 처리 중 오류가 발생했습니다.'
    throw new Error(message)
  }

  return data as T
}

function HomePage({ user }: HomePageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY
    if (!mapContainerRef.current || !appKey) {
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-kakao-maps-sdk="true"]',
    )

    const onLoadKakaoMap = () => {
      const { kakao } = window as any
      kakao.maps.load(() => {
        if (!mapContainerRef.current) return

        const center = new kakao.maps.LatLng(36.5, 127.8) // 대한민국 중심 근처 (lat, lng)
        const map = new kakao.maps.Map(mapContainerRef.current, {
          center,
          level: 12, // 숫자 커질수록 더 넓게
        })

        // 드래그/확대 가능하지만, 뷰포트는 한국 주변으로 제한
        const sw = new kakao.maps.LatLng(32.5, 123.0)
        const ne = new kakao.maps.LatLng(39.8, 132.0)
        const bounds = new kakao.maps.LatLngBounds(sw, ne)
        map.setBounds(bounds, 0, 0, 0, 0)
      })
    }

    if (existingScript && (window as any).kakao?.maps) {
      onLoadKakaoMap()
      return
    }

    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
    script.async = true
    script.dataset.kakaoMapsSdk = 'true'
    script.onload = onLoadKakaoMap
    document.head.appendChild(script)

    return () => {
      // 스크립트는 한 번만 로드하고 유지하므로 여기서는 제거하지 않음
    }
  }, [])

  return (
    <section className="page">
      <h1>SAR·CCTV 다중 센서 융합 관제</h1>
      <p className="muted">SAR 기반 전차 검출 위치 지도 시각화 및 위협/경로 분석 홈</p>
      {user ? (
        <>
          <p>
            현재 로그인: <strong>{user.email}</strong>
          </p>
          <p>
            좌측 메뉴: 전차 식별/추적, 거리 분석, 3D 모델링(MASt3R), 사용 가이드를 이용할 수 있습니다.
            아래 지도에 SAR 검출 표적과 위협·경로 정보가 순차적으로 연동될 예정입니다.
          </p>
        </>
      ) : (
        <p>로그인 후 전 기능을 이용할 수 있습니다.</p>
      )}

      <div className="map-section">
        <h2 className="map-title">전차 SAR 탐지 지도 (베이스맵)</h2>
        <div ref={mapContainerRef} className="maplibre-container" />
        <p className="muted">
          현재는 OSM 기반 베이스맵만 표시되며, 이후 SAR 검출 좌표·위협 반경·예상 경로가 이 지도 위에
          시각화됩니다.
        </p>
      </div>
    </section>
  )
}

function IdentificationTrackingPage() {
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [isSubmittingImage, setIsSubmittingImage] = useState(false)
  const [isSubmittingVideo, setIsSubmittingVideo] = useState(false)
  const [imageResult, setImageResult] = useState<YoloInferenceResponse | null>(null)
  const [videoResult, setVideoResult] = useState<YoloVideoInferenceResponse | null>(null)

  const handleSubmitImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setImageResult(null)

    if (!selectedImageFile) {
      setError('추론할 이미지를 먼저 선택해 주세요.')
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      setError('로그인 토큰이 없습니다. 다시 로그인해 주세요.')
      return
    }

    setIsSubmittingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedImageFile)

      const response = await fetch(`${API_BASE_URL}/ai/yolo/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = (await response.json().catch(() => ({}))) as YoloInferenceResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || 'YOLO 추론 요청에 실패했습니다.')
      }

      setImageResult(data)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'YOLO 추론 요청 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmittingImage(false)
    }
  }

  const handleSubmitVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setVideoResult(null)

    if (!selectedVideoFile) {
      setError('판별할 동영상 파일을 먼저 선택해 주세요.')
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      setError('로그인 토큰이 없습니다. 다시 로그인해 주세요.')
      return
    }

    setIsSubmittingVideo(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedVideoFile)

      const response = await fetch(`${API_BASE_URL}/ai/yolo/video`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = (await response.json().catch(() => ({}))) as YoloVideoInferenceResponse & {
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || 'YOLO 동영상 추론 요청에 실패했습니다.')
      }

      setVideoResult(data)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'YOLO 동영상 추론 요청 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmittingVideo(false)
    }
  }

  return (
    <section className="page">
      <h1>전차 식별 및 추적</h1>
      <p className="muted">담당: 유민, 태훈(작은)</p>
      <p>이미지/영상 업로드 및 실시간 카메라 입력에 대해 YOLO 기반 전차 검출·피아 분류·추적 결과를 표시합니다.</p>
      <p className="muted">
        실시간 카메라 입력: <NavLink to="/monitor">실시간 카메라 관제 페이지로 이동</NavLink>
      </p>

      <form className="form yolo-upload-form" onSubmit={handleSubmitImage}>
        <label>
          이미지 파일 선택
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setSelectedImageFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSubmittingImage}>
          {isSubmittingImage ? '추론 중...' : '이미지 추론 실행'}
        </button>
      </form>

      <form className="form yolo-upload-form" onSubmit={handleSubmitVideo}>
        <label>
          동영상 파일 선택
          <input
            type="file"
            accept="video/*"
            onChange={(event) => setSelectedVideoFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSubmittingVideo}>
          {isSubmittingVideo ? '동영상 분석 중...' : '동영상 판별 실행'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {imageResult && (
        <div className="yolo-result">
          <h3>이미지 추론 결과</h3>
          <p className="muted">입력 소스: {imageResult.source}</p>
          <p>
            검출 수: <strong>{imageResult.detections.length}</strong>
          </p>

          {imageResult.annotatedImageBase64 && (
            <img
              className="yolo-preview"
              src={`data:image/jpeg;base64,${imageResult.annotatedImageBase64}`}
              alt="YOLO annotated result"
            />
          )}

          <div className="table-wrap">
            <table className="dataset-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>라벨</th>
                  <th>신뢰도</th>
                  <th>트랙 ID</th>
                  <th>BBox</th>
                </tr>
              </thead>
              <tbody>
                {imageResult.detections.length > 0 ? (
                  imageResult.detections.map((item, index) => (
                    <tr key={`${item.label}-${index}`}>
                      <td>{index + 1}</td>
                      <td>{item.label}</td>
                      <td>{(item.confidence * 100).toFixed(1)}%</td>
                      <td>{item.trackId ?? '-'}</td>
                      <td>{item.bbox.map((v) => v.toFixed(1)).join(', ')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      검출된 객체가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {videoResult && (
        <div className="yolo-result">
          <h3>동영상 판별 결과</h3>
          <p className="muted">입력 소스: {videoResult.source}</p>
          <div className="video-summary-grid">
            <p>
              총 프레임: <strong>{videoResult.totalFrames.toLocaleString('ko-KR')}</strong>
            </p>
            <p>
              샘플링 프레임: <strong>{videoResult.sampledFrames.toLocaleString('ko-KR')}</strong>
            </p>
            <p>
              FPS: <strong>{videoResult.fps}</strong>
            </p>
            <p>
              총 검출 수: <strong>{videoResult.totalDetections.toLocaleString('ko-KR')}</strong>
            </p>
          </div>

          <h4>라벨별 검출 집계</h4>
          <div className="table-wrap">
            <table className="dataset-table">
              <thead>
                <tr>
                  <th>라벨</th>
                  <th>검출 수</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(videoResult.countsByLabel).length > 0 ? (
                  Object.entries(videoResult.countsByLabel).map(([label, count]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{count.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="empty-cell">
                      검출된 객체가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {videoResult.previewFramesBase64.length > 0 && (
            <>
              <h4>샘플 프레임 미리보기</h4>
              <div className="video-preview-grid">
                {videoResult.previewFramesBase64.map((frameBase64, index) => (
                  <img
                    key={`video-preview-${index}`}
                    className="yolo-preview"
                    src={`data:image/jpeg;base64,${frameBase64}`}
                    alt={`video preview ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function DistanceTrackingPage() {
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<Reconstruct3dMultiResponse | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setResult(null)

    if (files.length < 3) {
      setError('최소 3장의 이미지를 선택해 주세요.')
      return
    }

    const token = localStorage.getItem('accessToken')
    if (!token) {
      setError('로그인 토큰이 없습니다. 다시 로그인해 주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('files', file)
      }

      const response = await fetch(`${API_BASE_URL}/ai/reconstruct/points-multi`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: AbortSignal.timeout(600_000),
      })
      const data = (await response.json().catch(() => ({}))) as Reconstruct3dMultiResponse & {
        message?: string
      }
      if (!response.ok) {
        const msg =
          typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message?: string }).message)
            : '멀티 이미지 3D 복원 요청에 실패했습니다.'
        throw new Error(msg)
      }
      if (
        !data ||
        !Array.isArray(data.points3d) ||
        data.points3d.length === 0 ||
        !data.bounds
      ) {
        throw new Error('복원된 3D 점이 없습니다.')
      }
      setResult(data as Reconstruct3dMultiResponse)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '3D 점 복원 처리 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (!viewerRef.current || !result || result.points3d.length === 0) {
      return
    }

    const container = viewerRef.current
    container.innerHTML = ''

    const width = container.clientWidth || 900
    const height = 420

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#020617')

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 1000)
    camera.position.set(0, 0, 3.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    const points = result.points3d
    const bounds = result.bounds
    const centerX = (bounds.x[0] + bounds.x[1]) / 2
    const centerY = (bounds.y[0] + bounds.y[1]) / 2
    const centerZ = (bounds.z[0] + bounds.z[1]) / 2
    const spanX = Math.max(bounds.x[1] - bounds.x[0], 1e-6)
    const spanY = Math.max(bounds.y[1] - bounds.y[0], 1e-6)
    const spanZ = Math.max(bounds.z[1] - bounds.z[0], 1e-6)
    const scale = 2.2 / Math.max(spanX, spanY, spanZ)

    const positions = new Float32Array(points.length * 3)
    const colors = new Float32Array(points.length * 3)

    for (let i = 0; i < points.length; i += 1) {
      const [x, y, z] = points[i]
      positions[i * 3] = (x - centerX) * scale
      positions[i * 3 + 1] = (y - centerY) * scale
      positions[i * 3 + 2] = (z - centerZ) * scale

      const c = result.colorsRgb?.[i]
      colors[i * 3] = c ? c[0] / 255 : 0.58
      colors[i * 3 + 1] = c ? c[1] / 255 : 0.77
      colors[i * 3 + 2] = c ? c[2] / 255 : 0.98
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    })
    const cloud = new THREE.Points(geometry, material)
    scene.add(cloud)

    const axis = new THREE.AxesHelper(0.7)
    scene.add(axis)

    let frameId = 0
    const animate = () => {
      cloud.rotation.y += 0.0032
      cloud.rotation.x += 0.0008
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      container.innerHTML = ''
    }
  }, [result])

  return (
    <section className="page">
      <h1>전차 3D 점 복원 (멀티 이미지)</h1>
      <p className="muted">담당: 수빈</p>
      <p>여러 시점 이미지를 함께 입력해 전차의 3D 점군을 더 안정적으로 복원합니다.</p>

      <form className="form yolo-upload-form" onSubmit={handleSubmit}>
        <label>
          이미지 파일들 (최소 3장)
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? '복원 중...' : '3D 점 복원 실행'}
        </button>
      </form>
      <p className="muted">선택된 파일 수: {files.length}장</p>
      {isSubmitting && (
        <p className="muted">3D 복원에 2~3분 걸릴 수 있습니다. 완료될 때까지 기다려 주세요.</p>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="yolo-result">
          <h3>멀티 뷰 복원 결과</h3>
          <p className="muted">
            입력 이미지 수: {result.sourceCount}장 / 페어 수: {result.pairCount}
          </p>
          <div className="video-summary-grid">
            <p>
              복원 포인트 수: <strong>{result.pointCount.toLocaleString('ko-KR')}</strong>
            </p>
            {result.ply?.downloadUrl && (
              <p>
                PLY 파일:{' '}
                <a
                  href={`http://127.0.0.1:8001${result.ply.downloadUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  새 탭에서 열기 / 다운로드
                </a>
              </p>
            )}
          </div>

          <div className="point-cloud-wrap" ref={viewerRef} />
          <p className="muted">Three.js 기반 3D 점군 뷰어 (자동 회전)</p>
        </div>
      )}
    </section>
  )
}

function DistanceAnalysisPage() {
  return (
    <section className="page">
      <h1>거리 분석</h1>
      <p className="muted">담당: 태훈(큰) · 도로/경로 연동</p>
      <p>객체별 거리 추정 결과 시각화, 임계 거리 기반 위험 경고, 시간축 거리 변화 로그를 제공합니다.</p>
      <div className="kpi-grid" style={{ marginTop: '1rem' }}>
        <article className="kpi-card neutral">
          <p className="kpi-label">객체별 거리</p>
          <strong className="kpi-value">추정 결과 표시 예정</strong>
        </article>
        <article className="kpi-card warning">
          <p className="kpi-label">위험 경고</p>
          <strong className="kpi-value">임계 거리 초과 시 알림</strong>
        </article>
        <article className="kpi-card safe">
          <p className="kpi-label">시간축 로그</p>
          <strong className="kpi-value">거리 변화 이력</strong>
        </article>
      </div>
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        SAR·CCTV 연동 후 검출 표적에 대한 거리 추정 및 위험지역 지도 시각화가 이 페이지에 통합됩니다.
      </p>
    </section>
  )
}

function GuidePage() {
  return (
    <section className="page">
      <h1>사용 가이드</h1>
      <p className="muted">시스템 주요 기능을 직관적으로 안내합니다.</p>
      <ul style={{ lineHeight: 1.8, marginTop: '1rem' }}>
        <li><strong>홈 (SAR 지도)</strong> – SAR/항공 기반 전차 검출 위치 지도 시각화</li>
        <li><strong>전차 식별/추적</strong> – 이미지·영상 업로드 및 실시간 카메라, YOLO 기반 검출·피아 분류·추적</li>
        <li><strong>거리 분석</strong> – 객체별 거리 추정, 임계 거리 위험 경고, 시간축 거리 로그</li>
        <li><strong>3D 모델링 (MASt3R)</strong> – 멀티뷰 3D 점군 복원, 포신 자세 추정 기반 위협 분석</li>
        <li><strong>위험지역·경로</strong> – 포탄 위험지역 지도 표시 및 도로 기반 경로 탐색 (홈/거리 분석과 연동 예정)</li>
      </ul>
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        로그인 후 전 기능을 이용할 수 있으며, 실시간 경로 탐색 및 최적 경로 안내는 가입 완료 후 사용 가능합니다.
      </p>
    </section>
  )
}

function CameraMonitorPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsStreaming(false)
  }, [])

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return
    }

    const all = await navigator.mediaDevices.enumerateDevices()
    const cameras = all
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `카메라 ${index + 1}`,
      }))
    setDevices(cameras)
  }, [])

  const startStream = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('현재 브라우저는 카메라 스트리밍을 지원하지 않습니다.')
      return
    }

    setIsConnecting(true)
    setError('')
    stopStream()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: 'environment' },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setIsStreaming(true)

      const trackDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? ''
      setSelectedDeviceId(trackDeviceId || deviceId || '')
      await loadDevices()
    } catch {
      setError('카메라 접근에 실패했습니다. 권한을 확인해 주세요.')
    } finally {
      setIsConnecting(false)
    }
  }, [loadDevices, stopStream])

  useEffect(() => {
    void startStream()

    return () => {
      stopStream()
    }
  }, [startStream, stopStream])

  return (
    <section className="page camera-page">
      <div className="section-head">
        <h1>실시간 카메라 모니터링</h1>
        <span className={isStreaming ? 'camera-status live' : 'camera-status offline'}>
          {isStreaming ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <p className="muted">브라우저 카메라를 지연 없이 실시간으로 모니터링합니다.</p>

      <div className="camera-toolbar">
        <select
          value={selectedDeviceId}
          onChange={(event) => {
            const nextDeviceId = event.target.value
            setSelectedDeviceId(nextDeviceId)
            void startStream(nextDeviceId)
          }}
          disabled={isConnecting || devices.length === 0}
        >
          <option value="">카메라 선택</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn-primary"
          onClick={() => void startStream(selectedDeviceId || undefined)}
          disabled={isConnecting}
        >
          {isConnecting ? '연결 중...' : '재연결'}
        </button>
        <button type="button" className="btn-secondary" onClick={stopStream}>
          중지
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="camera-video-wrap">
        <video ref={videoRef} autoPlay playsInline muted />
      </div>
    </section>
  )
}

function AppLayout({ user, onLogout }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2 className="brand">Hanhwa Final</h2>
        <nav className="sidebar-nav">
          <NavLink to="/" end>홈 (SAR 지도)</NavLink>
          <NavLink to="/identification">전차 식별/추적</NavLink>
          <NavLink to="/distance-analysis">거리 분석</NavLink>
          <NavLink to="/distance-tracking">3D 모델링 (MASt3R)</NavLink>
          <NavLink to="/guide">사용 가이드</NavLink>
        </nav>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <div>
            <strong>데이터 분석 웹</strong>
          </div>
          <div className="topbar-right">
            {user ? (
              <>
                <span className="user-email">{user.email}</span>
                <button type="button" className="btn-secondary" onClick={onLogout}>
                  로그아웃
                </button>
              </>
            ) : (
              <nav className="auth-links">
                <NavLink to="/login">로그인</NavLink>
                <NavLink to="/signup">회원가입</NavLink>
              </nav>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AuthLayout({ user }: { user: User | null }) {
  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-shell">
      <section className="page auth-page">
        <Outlet />
      </section>
    </div>
  )
}

function LoginPage({ onLoggedIn }: LoginPageProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = useMemo(
    () => isSubmitting || !email.trim() || !password.trim(),
    [email, isSubmitting, password],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await requestJson<AuthResponse>(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      onLoggedIn(result)
      navigate('/')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '로그인에 실패했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <h1>Login</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="test@example.com"
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="최소 8자"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={isDisabled}>
          {isSubmitting ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </>
  )
}

function SignupPage({ onSignedUp }: SignupPageProps) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDisabled = useMemo(
    () => isSubmitting || !email.trim() || password.trim().length < 8,
    [email, isSubmitting, password],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await requestJson<AuthResponse>(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      onSignedUp(result)
      navigate('/')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '회원가입에 실패했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <h1>Signup</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          이름(선택)
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="tester"
          />
        </label>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="test@example.com"
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="최소 8자"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={isDisabled}>
          {isSubmitting ? '가입 중...' : '회원가입'}
        </button>
      </form>
    </>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('accessToken'),
  )
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!token) {
      return
    }

    void requestJson<User>(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((result) => setUser(result))
      .catch(() => {
        localStorage.removeItem('accessToken')
        setUser(null)
        setToken(null)
      })
  }, [token])

  const handleAuthSuccess = (payload: AuthResponse) => {
    localStorage.setItem('accessToken', payload.accessToken)
    setToken(payload.accessToken)
    setUser(payload.user)
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    setToken(null)
    setUser(null)
  }

  return (
    <Routes>
      <Route element={<AppLayout user={user} onLogout={handleLogout} />}>
        <Route path="/" element={<HomePage user={user} />} />
        <Route path="/identification" element={<IdentificationTrackingPage />} />
        <Route path="/monitor" element={<CameraMonitorPage />} />
        <Route path="/distance-analysis" element={<DistanceAnalysisPage />} />
        <Route path="/distance-tracking" element={<DistanceTrackingPage />} />
        <Route path="/guide" element={<GuidePage />} />
      </Route>
      <Route element={<AuthLayout user={user} />}>
        <Route path="/login" element={<LoginPage onLoggedIn={handleAuthSuccess} />} />
        <Route path="/signup" element={<SignupPage onSignedUp={handleAuthSuccess} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
