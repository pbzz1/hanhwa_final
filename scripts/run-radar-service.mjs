/**
 * radar-service 가상환경(.venv 또는 venv)을 찾아 uvicorn(8090)을 띄웁니다.
 * 루트에서 `npm run dev:all` 시 concurrently가 이 파일을 호출합니다.
 */
import { printDevAccessBanner } from './dev-lan-urls.mjs'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const radarDir = path.resolve(__dirname, '..', 'radar-service')

const win = process.platform === 'win32'
const pythonCandidates = win
  ? [
      path.join(radarDir, '.venv', 'Scripts', 'python.exe'),
      path.join(radarDir, 'venv', 'Scripts', 'python.exe'),
    ]
  : [
      path.join(radarDir, '.venv', 'bin', 'python'),
      path.join(radarDir, 'venv', 'bin', 'python3'),
      path.join(radarDir, 'venv', 'bin', 'python'),
    ]

let python = 'python'
for (const p of pythonCandidates) {
  if (existsSync(p)) {
    python = p
    break
  }
}

const RADAR_PORT = 8090
printDevAccessBanner(
  '[radar-service]',
  `FMCW 레이더 단독 API (uvicorn) — 포트 ${RADAR_PORT} (0.0.0.0)`,
  RADAR_PORT,
  [
    '헬스: GET /health · 처리: POST /v1/radar/process (multipart .bin)',
    '가상환경이 없으면: cd radar-service && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt',
  ],
)

const proc = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(RADAR_PORT), '--reload'],
  {
    cwd: radarDir,
    stdio: 'inherit',
    env: { ...process.env },
  },
)

proc.on('error', (err) => {
  console.error('[radar-service]', err.message)
  console.error('의존성: cd radar-service && pip install -r requirements.txt')
  process.exit(1)
})

proc.on('exit', (code) => {
  process.exit(code ?? 0)
})
