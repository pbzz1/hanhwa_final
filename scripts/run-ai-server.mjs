/**
 * ai-inference 가상환경(.venv 또는 venv)을 찾아 uvicorn(8001)을 띄웁니다.
 * 루트에서 `npm run dev:all` 시 concurrently가 이 파일을 호출합니다.
 */
import { printDevAccessBanner } from './dev-lan-urls.mjs'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const aiDir = path.resolve(__dirname, '..', 'ai-inference')

const win = process.platform === 'win32'
const pythonCandidates = win
  ? [
      path.join(aiDir, '.venv', 'Scripts', 'python.exe'),
      path.join(aiDir, 'venv', 'Scripts', 'python.exe'),
    ]
  : [
      path.join(aiDir, '.venv', 'bin', 'python'),
      path.join(aiDir, 'venv', 'bin', 'python3'),
      path.join(aiDir, 'venv', 'bin', 'python'),
    ]

let python = 'python'
for (const p of pythonCandidates) {
  if (existsSync(p)) {
    python = p
    break
  }
}

const AI_PORT = 8001
printDevAccessBanner(
  '[ai-inference]',
  `AI 추론 API (uvicorn) — 포트 ${AI_PORT} (0.0.0.0)`,
  AI_PORT,
  [
    'Nest가 같은 PC에서 돌면 backend/.env 의 AI_INFERENCE_URL=http://127.0.0.1:8001 로 두면 됩니다.',
  ],
)

const proc = spawn(
  python,
  ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', String(AI_PORT), '--reload'],
  {
    cwd: aiDir,
    stdio: 'inherit',
    env: { ...process.env },
  },
)

proc.on('error', (err) => {
  console.error('[ai-inference]', err.message)
  console.error('가상환경이 없으면: cd ai-inference && python -m venv .venv && pip install -r requirements.txt')
  process.exit(1)
})

proc.on('exit', (code) => {
  process.exit(code ?? 0)
})
