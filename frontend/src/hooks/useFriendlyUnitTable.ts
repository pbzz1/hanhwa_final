import { useMemo, useState } from 'react'
import type { FriendlyReadiness, FriendlyUnitTableRow } from '../types/commandCenter'

type SortKey = 'unitCode' | 'name' | 'level' | 'readiness' | 'updatedAt'
type SortDirection = 'asc' | 'desc'

export function useFriendlyUnitTable(rows: FriendlyUnitTableRow[]) {
  const [query, setQuery] = useState('')
  const [readinessFilter, setReadinessFilter] = useState<'ALL' | FriendlyReadiness>('ALL')
  const [levelFilter, setLevelFilter] = useState<'ALL' | string>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const levelOptions = useMemo(() => {
    const uniq = new Set<string>()
    for (const row of rows) uniq.add(row.level)
    return Array.from(uniq)
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = rows.filter((row) => {
      if (readinessFilter !== 'ALL' && row.readiness !== readinessFilter) return false
      if (levelFilter !== 'ALL' && row.level !== levelFilter) return false
      if (q.length === 0) return true
      return row.unitCode.toLowerCase().includes(q) || row.name.toLowerCase().includes(q)
    })

    const next = [...searched]
    next.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      } else {
        cmp = String(a[sortKey]).localeCompare(String(b[sortKey]), 'ko')
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return next
  }, [levelFilter, query, readinessFilter, rows, sortDirection, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDirection('asc')
      return
    }
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  return {
    query,
    setQuery,
    readinessFilter,
    setReadinessFilter,
    levelFilter,
    setLevelFilter,
    sortKey,
    sortDirection,
    toggleSort,
    levelOptions,
    filteredRows,
  }
}
