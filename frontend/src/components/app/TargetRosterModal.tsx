import { useEffect, useId, useRef, useState } from 'react'

export type TargetRosterTableRow = {
  rank: number
  targetNo: string
  location: string
  elevation: string
  scale: string
  status: string
  note: string
  /** 지도 이동용(WGS84). 적 표적 행 등에서 설정 */
  lat?: number
  lng?: number
  /** 아군 행 — DB 부대 id (채팅 등) */
  unitId?: number
  /** 적 행 — InfiltrationPoint id (체크·전송) */
  enemyInfiltrationId?: number
  /** 자산 탭 행 — 지도 ServiceAssetPoint id */
  serviceAssetId?: number
}

export type TargetRosterSendReceiverOption = { id: number; label: string }

type TargetRosterModalProps = {
  open: boolean
  onClose: () => void
  loading: boolean
  loadError: string | null
  enemyRows: TargetRosterTableRow[]
  friendlyRows: TargetRosterTableRow[]
  assetRows: TargetRosterTableRow[]
  /** 적 탭 — 선택된 침투 표적 id */
  selectedEnemyInfiltrationIds: readonly number[]
  onToggleEnemySelected: (infiltrationId: number) => void
  onToggleSelectAllEnemies: () => void
  onSendSelectedEnemies: () => void
  /** 선택 표적 전송 수신 부대 */
  sendReceiverOptions: readonly TargetRosterSendReceiverOption[]
  selectedSendReceiverUnitId: number | null
  onChangeSendReceiverUnitId: (unitId: number | null) => void
  /** 적 탭에서 행 클릭 시 해당 좌표로 지도 이동 */
  onEnemyRowNavigate?: (row: TargetRosterTableRow) => void
  /** 아군 탭 — 위치 옆 채팅 열기 */
  onFriendlyLocationChat?: (row: TargetRosterTableRow) => void
  /** 자산 탭 — 행 클릭 시 지도 이동 */
  onAssetRowNavigate?: (row: TargetRosterTableRow) => void
}

export function TargetRosterModal({
  open,
  onClose,
  loading,
  loadError,
  enemyRows,
  friendlyRows,
  assetRows,
  selectedEnemyInfiltrationIds,
  onToggleEnemySelected,
  onToggleSelectAllEnemies,
  onSendSelectedEnemies,
  sendReceiverOptions,
  selectedSendReceiverUnitId,
  onChangeSendReceiverUnitId,
  onEnemyRowNavigate,
  onFriendlyLocationChat,
  onAssetRowNavigate,
}: TargetRosterModalProps) {
  const titleId = useId()
  const [tab, setTab] = useState<'enemy' | 'friendly' | 'assets'>('enemy')
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) setTab('enemy')
  }, [open])

  const enemyIdList = enemyRows
    .map((r) => r.enemyInfiltrationId)
    .filter((id): id is number => id != null && Number.isFinite(id))
  const allEnemySelected =
    enemyIdList.length > 0 && enemyIdList.every((id) => selectedEnemyInfiltrationIds.includes(id))
  const someEnemySelected = selectedEnemyInfiltrationIds.length > 0 && !allEnemySelected

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = someEnemySelected
  }, [someEnemySelected, allEnemySelected, tab, open])

  if (!open) return null

  const rows = tab === 'enemy' ? enemyRows : tab === 'friendly' ? friendlyRows : assetRows
  const noColLabel = tab === 'enemy' ? '표적번호' : '식별번호'
  const locColLabel = tab === 'enemy' ? '표적위치' : '위치'
  const statusColLabel = tab === 'enemy' ? '상태' : '준비태세'
  const selectedCount = selectedEnemyInfiltrationIds.length
  const canSendBulk =
    selectedCount > 0 &&
    sendReceiverOptions.length > 0 &&
    selectedSendReceiverUnitId != null &&
    sendReceiverOptions.some((o) => o.id === selectedSendReceiverUnitId)

  return (
    <div className="target-roster-backdrop" role="presentation" onClick={onClose}>
      <div
        className="target-roster-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="target-roster-modal__head">
          <div className="target-roster-modal__head-text">
            <h2 id={titleId}>표적 일람표</h2>
            {loading && <p className="target-roster-modal__subhead muted">불러오는 중…</p>}
            {!loading && loadError && (
              <p className="target-roster-modal__subhead target-roster-modal__subhead--error">
                데이터를 불러오지 못했습니다. 백엔드와 네트워크를 확인하세요.
              </p>
            )}
          </div>
          <button type="button" className="target-roster-modal__close" aria-label="표적 일람표 닫기" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="target-roster-modal__tabs" role="tablist" aria-label="표적 구분">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'enemy'}
            className={`target-roster-modal__tab${tab === 'enemy' ? ' target-roster-modal__tab--active' : ''}`}
            onClick={() => setTab('enemy')}
          >
            적 ({enemyRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'friendly'}
            className={`target-roster-modal__tab${tab === 'friendly' ? ' target-roster-modal__tab--active' : ''}`}
            onClick={() => setTab('friendly')}
          >
            아군 ({friendlyRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'assets'}
            className={`target-roster-modal__tab${tab === 'assets' ? ' target-roster-modal__tab--active' : ''}`}
            onClick={() => setTab('assets')}
          >
            자산 ({assetRows.length})
          </button>
        </div>

        <div className="target-roster-modal__body">
          {loadError && <p className="target-roster-modal__banner target-roster-modal__banner--error muted">{loadError}</p>}
          {loading && <p className="target-roster-modal__hint muted">불러오는 중…</p>}
          {!loading && !loadError && rows.length === 0 && (
            <p className="target-roster-modal__empty muted">
              {tab === 'enemy'
                ? '등록된 적 표적이 없습니다.'
                : tab === 'friendly'
                  ? '등록된 아군 부대(사단·상급지휘소·포병·전차)가 없습니다.'
                  : '표시할 센서·UAV·드론 자산이 없습니다.'}
            </p>
          )}
          {rows.length > 0 && (
            <>
              <div className="target-roster-table-wrap">
                <table className="target-roster-table">
                  <thead>
                    <tr>
                      {tab === 'enemy' && (
                        <th scope="col" className="target-roster-table__th-check">
                          <span className="target-roster-table__sr-only">전체 선택</span>
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            className="target-roster-table__checkbox"
                            checked={allEnemySelected}
                            onChange={() => onToggleSelectAllEnemies()}
                            aria-label="적 표적 전체 선택"
                          />
                        </th>
                      )}
                      <th scope="col">순위</th>
                      <th scope="col">{noColLabel}</th>
                      <th scope="col">{locColLabel}</th>
                      {tab === 'friendly' && (
                        <th scope="col" className="target-roster-table__th-chat">
                          메시지
                        </th>
                      )}
                      <th scope="col">표고</th>
                      <th scope="col">규모</th>
                      <th scope="col">{statusColLabel}</th>
                      <th scope="col">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const enemyClickable =
                        tab === 'enemy' &&
                        typeof onEnemyRowNavigate === 'function' &&
                        row.lat != null &&
                        row.lng != null &&
                        Number.isFinite(row.lat) &&
                        Number.isFinite(row.lng)
                      const assetClickable =
                        tab === 'assets' &&
                        typeof onAssetRowNavigate === 'function' &&
                        row.lat != null &&
                        row.lng != null &&
                        Number.isFinite(row.lat) &&
                        Number.isFinite(row.lng)
                      const infilId = row.enemyInfiltrationId
                      const rowSelected =
                        infilId != null && selectedEnemyInfiltrationIds.includes(infilId)

                      return (
                        <tr
                          key={`${tab}-${row.rank}-${row.targetNo}`}
                          className={
                            enemyClickable || assetClickable ? 'target-roster-table__row--clickable' : undefined
                          }
                          tabIndex={enemyClickable || assetClickable ? 0 : undefined}
                          onClick={
                            enemyClickable
                              ? () => {
                                  onEnemyRowNavigate!(row)
                                }
                              : assetClickable
                                ? () => {
                                    onAssetRowNavigate!(row)
                                  }
                                : undefined
                          }
                          onKeyDown={
                            enemyClickable
                              ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    onEnemyRowNavigate!(row)
                                  }
                                }
                              : assetClickable
                                ? (event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      onAssetRowNavigate!(row)
                                    }
                                  }
                                : undefined
                          }
                        >
                          {tab === 'enemy' && (
                            <td
                              className="target-roster-table__td-check"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {infilId != null && (
                                <input
                                  type="checkbox"
                                  className="target-roster-table__checkbox"
                                  checked={rowSelected}
                                  onChange={() => onToggleEnemySelected(infilId)}
                                  aria-label={`${row.targetNo} 선택`}
                                />
                              )}
                            </td>
                          )}
                          <td>{row.rank}</td>
                          <td className="target-roster-table__mono">{row.targetNo}</td>
                          <td className="target-roster-table__mono target-roster-table__loc">{row.location}</td>
                          {tab === 'friendly' && (
                            <td className="target-roster-table__td-chat">
                              {row.unitId != null && typeof onFriendlyLocationChat === 'function' ? (
                                <button
                                  type="button"
                                  className="target-roster-table__chat-btn"
                                  aria-label={`${row.targetNo} 부대와 채팅`}
                                  title="채팅"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onFriendlyLocationChat(row)
                                  }}
                                >
                                  <span aria-hidden="true">💬</span>
                                </button>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          )}
                          <td>{row.elevation}</td>
                          <td>{row.scale}</td>
                          <td>{row.status}</td>
                          <td className="target-roster-table__note">{row.note}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {tab === 'enemy' && enemyRows.length > 0 && (
                <div className="target-roster-modal__bulk">
                  <label className="target-roster-modal__bulk-receiver">
                    <span className="target-roster-modal__bulk-receiver-label">수신 아군 부대</span>
                    <select
                      className="target-roster-modal__bulk-receiver-select"
                      value={selectedSendReceiverUnitId ?? ''}
                      onChange={(event) => {
                        const v = event.target.value
                        onChangeSendReceiverUnitId(v.length > 0 ? Number(v) : null)
                      }}
                      aria-label="선택 표적을 전달할 아군 부대"
                      disabled={sendReceiverOptions.length === 0}
                    >
                      {sendReceiverOptions.length === 0 ? (
                        <option value="">전송 가능한 부대 없음</option>
                      ) : (
                        sendReceiverOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="target-roster-modal__bulk-send"
                    disabled={!canSendBulk}
                    onClick={() => onSendSelectedEnemies()}
                  >
                    선택 표적 전송{selectedCount > 0 ? ` (${selectedCount}건)` : ''}
                  </button>
                  <p className="muted target-roster-modal__bulk-hint">
                    체크한 적 표적을 위에서 선택한 아군 부대로 정보 전달합니다. 전송 후 우측 채팅창에서 확인할 수 있습니다.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
