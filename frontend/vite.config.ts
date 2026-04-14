import { defineConfig } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
// 루트 스크립트(ESM) — 선언 파일 없음
// @ts-expect-error 7016
import { printDevAccessBanner } from '../scripts/dev-lan-urls.mjs'

/** 로컬 Nest — `getApiBaseUrl()` 이 dev에서 '' 일 때 같은 오리진으로 요청되어 여기로 프록시됨 */
const NEST_DEV_TARGET = 'http://127.0.0.1:3308'

const nestApiProxy: Record<string, string | ProxyOptions> = {
  '/auth': { target: NEST_DEV_TARGET, changeOrigin: true },
  '/map': { target: NEST_DEV_TARGET, changeOrigin: true },
  '/ai': { target: NEST_DEV_TARGET, changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'print-dev-access-urls',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const addr = server.httpServer?.address()
          if (!addr || typeof addr === 'string') return
          const port = addr.port
          printDevAccessBanner(
            '[frontend]',
            `Vite 개발 서버 (UI) — 포트 ${port}`,
            port,
            [
              '같은 Wi‑Fi의 다른 PC·폰: 위 IPv4 주소로 접속하면 됩니다.',
              'API는 Vite 프록시로 localhost:3308 에 연결됩니다 (ngrok/HTTPS에서도 동작). VITE_API_BASE_URL 로 덮어쓸 수 있습니다.',
            ],
          )
        })
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // ngrok 무료 URL(speak-xxx.ngrok-free.dev 등) — Host 헤더 허용
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'],
    proxy: nestApiProxy,
  },
  preview: {
    proxy: nestApiProxy,
  },
})
