export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 드래그·드롭 JSON 페이로드 (MIME application/json) */
export type TargetRosterDragRow = {
  rank: number
  targetNo: string
  location: string
  elevation: string
  scale: string
  status: string
  note: string
  enemyInfiltrationId: number
}

export type TargetRosterDragPayload = { v: 1; kind: 'target-roster-enemy'; rows: TargetRosterDragRow[] }

export function targetRosterTableRowToDragRow(row: {
  rank: number
  targetNo: string
  location: string
  elevation: string
  scale: string
  status: string
  note: string
  enemyInfiltrationId?: number | null
}): TargetRosterDragRow | null {
  const id = row.enemyInfiltrationId
  if (id == null || !Number.isFinite(id)) return null
  return {
    rank: row.rank,
    targetNo: row.targetNo,
    location: row.location,
    elevation: row.elevation,
    scale: row.scale,
    status: row.status,
    note: row.note,
    enemyInfiltrationId: id,
  }
}

export function parseTargetRosterDragPayload(raw: string): TargetRosterDragPayload | null {
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const o = data as Record<string, unknown>
    if (o.v !== 1 || o.kind !== 'target-roster-enemy' || !Array.isArray(o.rows)) return null
    const rows: TargetRosterDragRow[] = []
    for (const item of o.rows) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      if (
        typeof r.rank !== 'number' ||
        typeof r.targetNo !== 'string' ||
        typeof r.enemyInfiltrationId !== 'number'
      ) {
        continue
      }
      rows.push({
        rank: r.rank,
        targetNo: r.targetNo,
        location: String(r.location ?? ''),
        elevation: String(r.elevation ?? ''),
        scale: String(r.scale ?? ''),
        status: String(r.status ?? ''),
        note: String(r.note ?? ''),
        enemyInfiltrationId: r.enemyInfiltrationId,
      })
    }
    return rows.length > 0 ? { v: 1, kind: 'target-roster-enemy', rows } : null
  } catch {
    return null
  }
}

export function formatTargetRosterEnemyRowsHtml(rows: readonly TargetRosterDragRow[]): string {
  const head =
    '<table class="target-roster-msg-table"><thead><tr>' +
    '<th>순위</th><th>표적번호</th><th>표적위치</th><th>표고</th><th>규모</th><th>상태</th><th>비고</th>' +
    '</tr></thead><tbody>'
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(String(r.rank))}</td>` +
        `<td class="mono">${escapeHtml(r.targetNo)}</td>` +
        `<td class="mono">${escapeHtml(r.location)}</td>` +
        `<td>${escapeHtml(r.elevation)}</td>` +
        `<td>${escapeHtml(r.scale)}</td>` +
        `<td>${escapeHtml(r.status)}</td>` +
        `<td>${escapeHtml(r.note)}</td></tr>`,
    )
    .join('')
  return `${head}${body}</tbody></table>`
}
