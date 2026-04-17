import { BATTLEFIELD_HOTKEY_REFERENCE_ROWS } from '../../battlefield/battlefieldHotkeys'

type BattlefieldKeyboardShortcutsModalProps = {
  open: boolean
  onClose: () => void
}

export function BattlefieldKeyboardShortcutsModal({ open, onClose }: BattlefieldKeyboardShortcutsModalProps) {
  if (!open) return null

  return (
    <div className="battlefield-shortcuts-backdrop" role="presentation" onClick={onClose}>
      <div
        className="battlefield-shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="battlefield-shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="battlefield-shortcuts-modal__head">
          <h2 id="battlefield-shortcuts-title">바로 가기 키</h2>
          <button type="button" className="battlefield-shortcuts-modal__close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="battlefield-shortcuts-modal__hint muted">
          입력란·채팅 포커스일 때는 지도 단축키가 동작하지 않습니다. 단축키 도움말은 <kbd>?</kbd> (Shift+/) 로
          열 수 있습니다.
        </p>
        <div className="battlefield-shortcuts-table-wrap">
          <table className="battlefield-shortcuts-table">
            <thead>
              <tr>
                <th scope="col">명령</th>
                <th scope="col">키 바인딩</th>
              </tr>
            </thead>
            <tbody>
              {BATTLEFIELD_HOTKEY_REFERENCE_ROWS.map((row) => (
                <tr key={row.command}>
                  <td>{row.command}</td>
                  <td className="battlefield-shortcuts-table__kbd">{row.keybinding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
