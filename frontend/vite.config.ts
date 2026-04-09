import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// 루트 스크립트(ESM) — 선언 파일 없음
// @ts-expect-error 7016
import { printDevAccessBanner } from '../scripts/dev-lan-urls.mjs'

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
              '프론트는 접속한 호스트와 동일한 IP의 :3308 로 API를 호출합니다 (VITE_API_BASE_URL 미설정 시).',
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
  },
})
