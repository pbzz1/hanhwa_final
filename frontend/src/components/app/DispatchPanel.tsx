import { useEffect, useMemo, useState } from 'react'
import { DispatchMessageBody } from './DispatchMessageBody'
import type {
  DispatchAttachmentFlags,
  DispatchMessage,
  DispatchMessageType,
  DispatchPriority,
  FriendlyUnitTableRow,
} from '../../types/commandCenter'

type DispatchPanelProps = {
  units: FriendlyUnitTableRow[]
  selectedUnitId: number | null
  selectedContextLabel: string | null
  onSend: (payload: {
    receiverUnitId: number
    title: string
    content: string
    messageType: DispatchMessageType
    priority: DispatchPriority
    attachments: DispatchAttachmentFlags
  }) => void
  logs: DispatchMessage[]
  logReceiverFilter: number | 'ALL'
  onChangeLogReceiverFilter: (receiverId: number | 'ALL') => void
  mode?: 'panel' | 'modal'
  onClose?: () => void
}

const DEFAULT_ATTACHMENTS: DispatchAttachmentFlags = {
  enemyPosition: true,
  riskZones: false,
  detections: true,
  predictedRoute: false,
  sensorAnalysis: false,
}

export function DispatchPanel({
  units,
  selectedUnitId,
  selectedContextLabel,
  onSend,
  logs,
  logReceiverFilter,
  onChangeLogReceiverFilter,
  mode = 'panel',
  onClose,
}: DispatchPanelProps) {
  const [receiverUnitId, setReceiverUnitId] = useState<number | null>(selectedUnitId)
  const [messageType, setMessageType] = useState<DispatchMessageType>('INFO')
  const [priority, setPriority] = useState<DispatchPriority>('MEDIUM')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<DispatchAttachmentFlags>(DEFAULT_ATTACHMENTS)

  useEffect(() => {
    if (selectedUnitId == null) return
    setReceiverUnitId((prev) => prev ?? selectedUnitId)
  }, [selectedUnitId])

  const selectedUnit = useMemo(
    () => units.find((row) => row.id === receiverUnitId) ?? null,
    [receiverUnitId, units],
  )

  const toggleAttachment = (key: keyof DispatchAttachmentFlags) => {
    setAttachments((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const fillFromContext = () => {
    const headline = selectedContextLabel ?? '지도 선택 객체 없음'
    if (title.trim().length === 0) setTitle(`[상황공유] ${headline}`)
    if (content.trim().length === 0) {
      setContent(`현재 전장 상황을 공유합니다.\n- 기준 객체: ${headline}\n- 필요 시 정찰/경계 단계 상향 바랍니다.`)
    }
  }

  const submit = () => {
    if (receiverUnitId == null) return
    if (title.trim().length === 0 || content.trim().length === 0) return
    onSend({
      receiverUnitId,
      title: title.trim(),
      content: content.trim(),
      messageType,
      priority,
      attachments,
    })
    setTitle('')
    setContent('')
  }

  return (
    <section className={`service-panel-section dispatch-panel${mode === 'modal' ? ' dispatch-panel--modal' : ''}`}>
      <div className="dispatch-panel__title-row">
        <h2>정보 전달 / 전파</h2>
        {mode === 'modal' && onClose && (
          <button type="button" className="dispatch-panel__close" onClick={onClose} aria-label="전파 팝업 닫기">
            ×
          </button>
        )}
      </div>
      <div className="dispatch-panel__form">
        <label>
          수신 대상 부대
          <select
            value={receiverUnitId ?? ''}
            onChange={(event) =>
              setReceiverUnitId(event.target.value.length > 0 ? Number(event.target.value) : null)
            }
          >
            <option value="">부대 선택</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {`${unit.unitCode} · ${unit.name}`}
              </option>
            ))}
          </select>
        </label>

        <div className="dispatch-panel__row">
          <label>
            유형
            <select
              value={messageType}
              onChange={(event) => setMessageType(event.target.value as DispatchMessageType)}
            >
              <option value="INFO">INFO</option>
              <option value="ALERT">ALERT</option>
              <option value="ORDER">ORDER</option>
              <option value="RECON">RECON</option>
            </select>
          </label>
          <label>
            우선순위
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as DispatchPriority)}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </label>
        </div>

        <label>
          제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="전파 제목" />
        </label>
        <label>
          본문
          <textarea
            rows={4}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="전달 내용"
          />
        </label>

        <fieldset className="dispatch-panel__attachments">
          <legend>첨부 정보</legend>
          <label>
            <input
              type="checkbox"
              checked={attachments.enemyPosition}
              onChange={() => toggleAttachment('enemyPosition')}
            />
            적 위치
          </label>
          <label>
            <input type="checkbox" checked={attachments.riskZones} onChange={() => toggleAttachment('riskZones')} />
            위험지역
          </label>
          <label>
            <input type="checkbox" checked={attachments.detections} onChange={() => toggleAttachment('detections')} />
            탐지 결과
          </label>
          <label>
            <input
              type="checkbox"
              checked={attachments.predictedRoute}
              onChange={() => toggleAttachment('predictedRoute')}
            />
            이동 경로 예측
          </label>
          <label>
            <input
              type="checkbox"
              checked={attachments.sensorAnalysis}
              onChange={() => toggleAttachment('sensorAnalysis')}
            />
            센서 분석 결과
          </label>
        </fieldset>

        <div className="dispatch-panel__actions">
          <button type="button" className="btn-secondary" onClick={fillFromContext}>
            선택 객체 기반 자동작성
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={receiverUnitId == null || title.trim().length === 0 || content.trim().length === 0}
          >
            전파
          </button>
        </div>

        {selectedUnit && (
          <p className="dispatch-panel__target-hint muted">{`${selectedUnit.unitCode} · ${selectedUnit.name} 대상으로 송신 예정`}</p>
        )}
      </div>

      <div className="dispatch-panel__log-head">
        <h3>전파 로그</h3>
        <select
          value={logReceiverFilter === 'ALL' ? 'ALL' : String(logReceiverFilter)}
          onChange={(event) =>
            onChangeLogReceiverFilter(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))
          }
        >
          <option value="ALL">전체 수신 부대</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {`${unit.unitCode} · ${unit.name}`}
            </option>
          ))}
        </select>
      </div>
      <ul className="dispatch-panel__log-list">
        {logs.map((row) => (
          <li key={row.id} className={`dispatch-panel__log-item dispatch-panel__log-item--${row.priority.toLowerCase()}`}>
            <div className="dispatch-panel__log-top">
              <strong>{row.title}</strong>
              <span>{`${row.messageType} · ${row.priority}`}</span>
            </div>
            <DispatchMessageBody message={row} className="dispatch-panel__log-content" />
            <p className="dispatch-panel__log-meta muted">
              {`${row.receiverUnitCode} ${row.receiverUnitName} · ${new Date(row.createdAt).toLocaleString('ko-KR')}`}
            </p>
          </li>
        ))}
        {logs.length === 0 && <li className="dispatch-panel__log-empty muted">아직 전파 로그가 없습니다.</li>}
      </ul>
    </section>
  )
}
