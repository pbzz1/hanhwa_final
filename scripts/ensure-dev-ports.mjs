/**
 * 개발 서버용 TCP 인바운드 허용 (Windows 방화벽).
 * 관리자 권한이 없으면 실패할 수 있으며, 이 경우 0.0.0.0 바인딩만으로 LAN 내 동일 세그먼트 접속은 가능할 수 있습니다.
 */
import { spawnSync } from 'node:child_process'
import os from 'node:os'

const PORTS = [
  { port: 3308, name: 'HanhwaFinal-Dev-Nest' },
  { port: 5173, name: 'HanhwaFinal-Dev-Vite' },
  { port: 8001, name: 'HanhwaFinal-Dev-AI' },
  { port: 8090, name: 'HanhwaFinal-Dev-Radar' },
]

function main() {
  console.log(
    '[ensure-dev-ports] 로컬(본인 PC) 접속은 이 스크립트와 무관합니다. 브라우저: http://localhost:5173 · API: http://localhost:3308 (기본)',
  )
  console.log(
    '[ensure-dev-ports] 아래 netsh는 Windows 방화벽에 인바운드 규칙을 넣어 "같은 공유기의 다른 기기"에서 접속할 때만 필요합니다. 관리자 권한이 없으면 실패해도 localhost 개발은 정상입니다.',
  )
  if (os.platform() !== 'win32') {
    console.log(
      '[ensure-dev-ports] Windows가 아닙니다. 방화벽 규칙은 건너뜁니다. (Nest/Vite/uvicorn은 0.0.0.0 바인딩)',
    )
    return
  }

  let ok = 0
  for (const { port, name } of PORTS) {
    spawnSync(
      'netsh',
      ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`],
      { encoding: 'utf-8', windowsHide: true },
    )
    const r = spawnSync(
      'netsh',
      [
        'advfirewall',
        'firewall',
        'add',
        'rule',
        `name=${name}`,
        'dir=in',
        'action=allow',
        'protocol=TCP',
        `localport=${port}`,
      ],
      { encoding: 'utf-8', windowsHide: true },
    )
    if (r.status === 0) {
      console.log(`[ensure-dev-ports] 방화벽 인바운드 허용: TCP ${port} (${name})`)
      ok += 1
    } else {
      const err = (r.stderr || r.stdout || '').trim()
      console.warn(
        `[ensure-dev-ports] TCP ${port} 규칙 추가 실패 — 터미널을 관리자 권한으로 연 뒤 npm run dev:fw 또는 npm run dev:all:fw 를 실행하거나, 방화벽에서 TCP ${port} 인바운드를 수동 허용하세요.`,
      )
      if (err) console.warn(err.slice(0, 300))
    }
  }

  if (ok < PORTS.length) {
    console.warn(
      '[ensure-dev-ports] 일부 포트만 열렸을 수 있습니다. 다른 PC에서는 http://<이PC_IP>:5173 과 VITE_API_BASE_URL=http://<이PC_IP>:3308 을 사용하세요.',
    )
  }
}

main()
