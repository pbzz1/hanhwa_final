import type { DispatchMessage } from '../../types/commandCenter'

type DispatchMessageBodyProps = {
  message: DispatchMessage
  className?: string
}

/** HTML 전파(표적 표) vs 일반 텍스트 */
export function DispatchMessageBody({ message, className }: DispatchMessageBodyProps) {
  const base = className ?? ''
  if (message.contentFormat === 'html') {
    return (
      <div
        className={`dispatch-msg-html${base ? ` ${base}` : ''}`}
        dangerouslySetInnerHTML={{ __html: message.content }}
      />
    )
  }
  return <p className={base}>{message.content}</p>
}
