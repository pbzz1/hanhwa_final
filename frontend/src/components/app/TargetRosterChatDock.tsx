import { useEffect, useId, useRef, useState } from 'react'
import type { DispatchMessage } from '../../types/commandCenter'
import type { TargetRosterDragRow } from '../../utils/targetRosterMessageHtml'
import { parseTargetRosterDragPayload } from '../../utils/targetRosterMessageHtml'
import { DispatchMessageBody } from './DispatchMessageBody'

type TargetRosterChatDockProps = {
  unitId: number
  unitCode: string
  unitName: string
  messages: DispatchMessage[]
  onClose: () => void
  onSend: (content: string) => void
  /** 표적 일람표 적 행을 채팅 영역으로 드롭했을 때 */
  onDropEnemyRows?: (rows: TargetRosterDragRow[]) => void
}

function formatChatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function TargetRosterChatDock({
  unitId,
  unitCode,
  unitName,
  messages,
  onClose,
  onSend,
  onDropEnemyRows,
}: TargetRosterChatDockProps) {
  const titleId = useId()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const sortedAsc = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, sortedAsc.length])

  const submit = () => {
    const text = draft.trim()
    if (text.length === 0) return
    onSend(text)
    setDraft('')
  }

  const dropEnabled = typeof onDropEnemyRows === 'function'

  return (
    <aside
      className="target-roster-chat-dock target-roster-chat-dock--kt"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <header className="target-roster-chat-dock__kt-head">
        <div className="target-roster-chat-dock__kt-peer">
          <div className="target-roster-chat-dock__kt-avatar" aria-hidden="true">
            {unitName.slice(0, 1)}
          </div>
          <div>
            <h2 id={titleId} className="target-roster-chat-dock__kt-title">
              {unitName}
            </h2>
            <p className="target-roster-chat-dock__kt-sub">
              {unitCode} · 수신 중 · ID {unitId}
            </p>
          </div>
        </div>
        <button type="button" className="target-roster-chat-dock__kt-close" onClick={onClose} aria-label="채팅 닫기">
          ×
        </button>
      </header>

      <div
        ref={listRef}
        className={`target-roster-chat-dock__kt-scroll${dropEnabled ? ' target-roster-chat-dock__kt-scroll--droppable' : ''}`}
        role="log"
        aria-live="polite"
        onDragOver={
          dropEnabled
            ? (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }
            : undefined
        }
        onDrop={
          dropEnabled
            ? (e) => {
                e.preventDefault()
                const raw = e.dataTransfer.getData('application/json')
                const parsed = parseTargetRosterDragPayload(raw)
                if (parsed && onDropEnemyRows) {
                  onDropEnemyRows(parsed.rows)
                }
              }
            : undefined
        }
      >
        {sortedAsc.length === 0 && (
          <p className="target-roster-chat-dock__kt-empty muted">
            {dropEnabled
              ? '대화가 없습니다. 표적 일람표에서 행을 끌어 넣거나 메시지를 입력하세요.'
              : '대화가 없습니다. 메시지를 남겨보세요.'}
          </p>
        )}
        {sortedAsc.map((row) => (
          <div key={row.id} className="target-roster-chat-dock__kt-row target-roster-chat-dock__kt-row--out">
            <div className="target-roster-chat-dock__kt-bubble-wrap">
              {row.title.trim().length > 0 && (
                <span className="target-roster-chat-dock__kt-label">{row.title}</span>
              )}
              <div className="target-roster-chat-dock__kt-bubble">
                <DispatchMessageBody message={row} className="target-roster-chat-dock__kt-bubble-text" />
              </div>
              <time className="target-roster-chat-dock__kt-meta" dateTime={row.createdAt}>
                {formatChatTime(row.createdAt)} · {row.messageType}
              </time>
            </div>
          </div>
        ))}
      </div>

      <footer className="target-roster-chat-dock__kt-footer">
        <div className="target-roster-chat-dock__kt-inputbar">
          <label htmlFor={`${titleId}-msg`} className="target-roster-chat-dock__kt-sr-only">
            메시지 입력
          </label>
          <textarea
            id={`${titleId}-msg`}
            className="target-roster-chat-dock__kt-input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="메시지를 입력하세요"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button
            type="button"
            className="target-roster-chat-dock__kt-sendfab"
            onClick={submit}
            disabled={draft.trim().length === 0}
            aria-label="전송"
            title="전송"
          >
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </footer>
    </aside>
  )
}
