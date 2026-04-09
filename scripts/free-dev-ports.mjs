/**
 * Nest(3308)·Vite(5173) 개발 포트를 점유 중인 프로세스를 종료합니다.
 * 이전에 종료되지 않은 node(백엔드/프론트) 잔존 시 EADDRINUSE 방지용.
 */
import { execSync, spawnSync } from 'node:child_process'
import os from 'node:os'

const PORTS = [3308, 5173]

function killWindows(port) {
  const r = spawnSync('cmd', ['/c', 'netstat', '-ano', '-p', 'tcp'], {
    encoding: 'utf-8',
    windowsHide: true,
  })
  const lines = (r.stdout || '').split(/\r?\n/)
  const pids = new Set()
  const portSuffix = new RegExp(`:${port}$`)
  for (const line of lines) {
    const cols = line.trim().split(/\s+/).filter(Boolean)
    if (cols.length < 5 || cols[3] !== 'LISTENING') continue
    const local = cols[1]
    if (!portSuffix.test(local)) continue
    const pid = cols[cols.length - 1]
    if (/^\d+$/.test(pid)) pids.add(pid)
  }
  for (const pid of pids) {
    console.log(`[free-dev-ports] TCP ${port} 점유 PID ${pid} 종료 (taskkill)`)
    spawnSync('taskkill', ['/PID', pid, '/F'], { encoding: 'utf-8', windowsHide: true })
  }
}

function killPosix(port) {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf-8' }).trim()
    if (!out) return
    for (const pid of out.split('\n')) {
      if (!/^\d+$/.test(pid)) continue
      console.log(`[free-dev-ports] TCP ${port} 점유 PID ${pid} 종료 (kill -9)`)
      spawnSync('kill', ['-9', pid])
    }
  } catch {
    /* no listener */
  }
}

function main() {
  for (const port of PORTS) {
    if (os.platform() === 'win32') killWindows(port)
    else killPosix(port)
  }
}

main()
