import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type Props = {
  /** 거리 m, 방위·고도(도) — 주변에 지터를 준 3D 포인트 클라우드 생성 */
  rangeM: number
  azimuthDeg: number
  elevationDeg: number
  className?: string
  /**
   * true: 차량(ego) 뒤·소고도에서 클러스터 중심(전방 주시)을 바라봄 — 동기 카메라 시야와 축 맞춤용
   */
  egoSyncView?: boolean
}

/** 화면용 고정 스케일(m) — 실제 거리(rangeM)와 무관하게 클러스터가 같은 뷰에 머무름 */
const LOCAL_CLUSTER_RADIUS_M = 9

/**
 * 방위·고도는 실제 탐지를 따르고, 반경만 LOCAL_CLUSTER_RADIUS_M 근처로 정규화.
 * (ENU 근사: x 동, y 북, z 상)
 */
function buildScatterPositions(
  azimuthDeg: number,
  elevationDeg: number,
  count: number,
): Float32Array {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = LOCAL_CLUSTER_RADIUS_M * (0.88 + Math.random() * 0.2)
    const da = ((Math.random() - 0.5) * 5 * Math.PI) / 180
    const de = ((Math.random() - 0.5) * 2.5 * Math.PI) / 180
    const a = az + da
    const e = el + de
    const x = r * Math.cos(e) * Math.sin(a)
    const y = r * Math.cos(e) * Math.cos(a)
    const z = r * Math.sin(e)
    out[i * 3] = x
    out[i * 3 + 1] = y
    out[i * 3 + 2] = z
  }
  return out
}

export function FmcwRadarScatter3D({
  rangeM,
  azimuthDeg,
  elevationDeg,
  className,
  egoSyncView = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [webglError, setWebglError] = useState<string | null>(null)

  useEffect(() => {
    setWebglError(null)
    const el = containerRef.current
    if (!el) return

    let renderer: THREE.WebGLRenderer | null = null
    let raf = 0
    let geom: THREE.BufferGeometry | null = null
    let mat: THREE.PointsMaterial | null = null
    let onResize: (() => void) | null = null

    try {
      const width = Math.max(el.clientWidth || 320, 280)
      const height = Math.max(el.clientHeight || 240, 200)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0f172a)

      const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 500)
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      el.appendChild(renderer.domElement)

      const positions = buildScatterPositions(azimuthDeg, elevationDeg, 64)
      geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const colors = new Float32Array((positions.length / 3) * 3)
      const zScale = LOCAL_CLUSTER_RADIUS_M * 0.45
      for (let i = 0; i < positions.length / 3; i++) {
        const z = positions[i * 3 + 2]
        const t = (z / zScale + 1) * 0.5
        const c = new THREE.Color().setHSL(0.55 + Math.min(1, Math.max(0, t)) * 0.12, 0.75, 0.55)
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      mat = new THREE.PointsMaterial({
        size: 3.2,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.92,
      })
      const points = new THREE.Points(geom, mat)
      scene.add(points)

      const axes = new THREE.AxesHelper(5)
      scene.add(axes)

      points.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(points)
      const center = new THREE.Vector3()
      const size = new THREE.Vector3()
      if (box.isEmpty()) {
        center.set(0, 0, 0)
        size.set(4, 4, 4)
      } else {
        box.getCenter(center)
        box.getSize(size)
      }
      const radius = Math.max(size.x, size.y, size.z, 3) * 1.75

      if (egoSyncView) {
        const dir = center.clone()
        const horiz = Math.hypot(dir.x, dir.y)
        if (horiz < 1e-3) {
          dir.set(0, 1, 0)
        } else {
          dir.normalize()
        }
        const dist = Math.max(radius * 2.4, 22)
        const camH = 2.8
        camera.position.set(-dir.x * dist, -dir.y * dist, camH)
        camera.lookAt(center)
      } else {
        camera.position.set(center.x + radius * 0.9, center.y + radius * 0.55, center.z + radius * 0.75)
        camera.lookAt(center)
      }

      scene.add(new THREE.AmbientLight(0xffffff, 0.9))

      const tick = () => {
        points.rotation.z += 0.0012
        renderer!.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }
      tick()

      onResize = () => {
        if (!containerRef.current || !renderer) return
        const w = Math.max(containerRef.current.clientWidth, 280)
        const h = Math.max(containerRef.current.clientHeight, 200)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
      window.addEventListener('resize', onResize)

      return () => {
        cancelAnimationFrame(raf)
        if (onResize) window.removeEventListener('resize', onResize)
        geom?.dispose()
        mat?.dispose()
        renderer?.dispose()
        if (renderer?.domElement.parentNode === el) {
          el.removeChild(renderer.domElement)
        }
      }
    } catch (e) {
      setWebglError(e instanceof Error ? e.message : 'WebGL 초기화 실패')
      return undefined
    }
  }, [azimuthDeg, elevationDeg, egoSyncView])

  return (
    <div
      ref={containerRef}
      className={className}
      title={`3D 뷰는 고정 스케일(약 ${LOCAL_CLUSTER_RADIUS_M}m) · 실제 탐지 거리 ${Number.isFinite(rangeM) ? `${Math.round(rangeM)} m` : '—'}${egoSyncView ? ' · ego 동기 시점' : ''}`}
      style={{
        width: '100%',
        minHeight: 240,
        height: 260,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        background: webglError ? '#fef2f2' : '#0f172a',
      }}
    >
      {webglError ? (
        <div style={{ padding: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>{webglError}</p>
        </div>
      ) : null}
    </div>
  )
}
