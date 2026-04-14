const DEFAULT_API_PORT = 3308

/**
 * API 베이스 URL.
 *
 * 1) `VITE_API_BASE_URL` 이 있으면 그대로 사용 (배포·별도 API 도메인).
 *
 * 2) 개발(`vite` / `vite dev`): 빈 문자열 → `/auth`, `/map`, `/ai` 를 **현재 페이지와 같은 오리진**
 *    (예: ngrok `https://xxx.ngrok-free.dev:5173`)으로 요청하고, Vite `server.proxy`가 로컬 Nest(3308)로 넘깁니다.
 *    이렇게 해야 HTTPS 터널에서 `http://같은호스트:3308` 호출로 막히는 **mixed content**·**3308 미노출** 문제가 없습니다.
 *
 * 3) 프로덕션 빌드(`vite build` 후 `preview`·정적 호스팅): 환경 변수가 없으면 `window.location.origin`
 *    (프론트와 API를 같은 도메인/리버스프록시로 묶은 경우). API가 다른 도메인이면 빌드 시 `VITE_API_BASE_URL` 필수.
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.replace(/\/+$/, '')
  }
  if (import.meta.env.DEV) {
    return ''
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return `http://localhost:${DEFAULT_API_PORT}`
}
