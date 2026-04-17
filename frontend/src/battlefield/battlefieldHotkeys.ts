/** 상단바 등에서 전장 단축키 도움말 모달을 열 때 `window.dispatchEvent`로 보내는 이벤트 이름 */
export const BATTLEFIELD_SHORTCUTS_HELP_OPEN_EVENT = 'battlefield:shortcuts-help-open'

/** 전장 서비스 단축키 — 텍스트 입력 중에는 지도/명령 단축키를 먹지 않도록 구분 */

export function isHotkeyTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.getAttribute('role') === 'textbox' || target.getAttribute('role') === 'combobox') return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export type BattlefieldHotkeyReferenceRow = {
  command: string
  keybinding: string
}

/** 단축키 도움말 모달에 표시할 고정 목록 (구현과 동기 유지) */
export const BATTLEFIELD_HOTKEY_REFERENCE_ROWS: readonly BattlefieldHotkeyReferenceRow[] = [
  { command: '전역 시야로 전환', keybinding: 'Alt+1' },
  { command: '한반도 작전권역 시야로 전환', keybinding: 'Alt+2' },
  { command: 'SAR 탐지 전개', keybinding: 'Alt+3' },
  { command: '작전 지역 검색창으로 포커스', keybinding: 'Ctrl+Shift+F' },
  { command: '지도 확대 / 축소', keybinding: '+ / − (Shift+=, − 또는 숫자패드)' },
  { command: '주 시나리오 CTA (배속 순환 또는 시나리오 완료/재시작)', keybinding: 'Space' },
  { command: '시뮬레이션 일시정지 / 재개', keybinding: 'Alt+P' },
  { command: '시뮬레이션 타임라인 슬라이더 포커스', keybinding: 'Alt+L' },
  { command: '표적 일람표 열기 / 닫기', keybinding: 'Alt+T' },
  { command: '선택 표적 전송 (일람표)', keybinding: 'Ctrl+Enter' },
  { command: '단축키 도움말', keybinding: '? (Shift+/)' },
]
