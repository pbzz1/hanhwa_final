/**
 * 개발 서버 기동 시 터미널에 찍을 LAN/localhost 접속 URL 목록.
 */
import os from 'node:os'

/** @param {number} port */
export function listDevHttpUrls(port) {
  const uniq = new Set()
  uniq.add(`http://127.0.0.1:${port}`)
  uniq.add(`http://localhost:${port}`)
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        uniq.add(`http://${a.address}:${port}`)
      }
    }
  }
  return [...uniq]
}

/**
 * @param {string} prefix 로그 줄 접두사 (예: '[frontend]')
 * @param {string} title 한 줄 설명
 * @param {number} port
 * @param {string[]} [extraLines] 추가 안내 (prefix 없이 본문만)
 */
export function printDevAccessBanner(prefix, title, port, extraLines = []) {
  console.log(`\n${prefix} ${title}`)
  for (const u of listDevHttpUrls(port)) {
    console.log(`${prefix}   · ${u}`)
  }
  for (const line of extraLines) {
    console.log(`${prefix} ${line}`)
  }
  console.log('')
}
