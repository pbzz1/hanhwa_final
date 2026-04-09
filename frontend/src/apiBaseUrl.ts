const DEFAULT_API_PORT = 3308

/**
 * `VITE_API_BASE_URL` 이 비어 있으면, 브라우저가 열린 호스트와 동일한 IP로 Nest API를 호출합니다.
 * - `http://localhost:5173` → `http://localhost:3308`
 * - `http://192.168.x.x:5173` → `http://192.168.x.x:3308` (같은 망 다른 기기)
 *
 * 배포 시에는 반드시 `VITE_API_BASE_URL`에 절대 URL을 지정하세요.
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:${DEFAULT_API_PORT}`
  }
  return `http://localhost:${DEFAULT_API_PORT}`
}
