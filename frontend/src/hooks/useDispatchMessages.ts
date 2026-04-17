import { useMemo, useState } from 'react'
import type { DispatchMessage } from '../types/commandCenter'

export function useDispatchMessages() {
  const [messages, setMessages] = useState<DispatchMessage[]>([])
  const [receiverFilter, setReceiverFilter] = useState<number | 'ALL'>('ALL')

  const filteredMessages = useMemo(() => {
    if (receiverFilter === 'ALL') return messages
    return messages.filter((row) => row.receiverUnitId === receiverFilter)
  }, [messages, receiverFilter])

  const addMessage = (payload: DispatchMessage) => {
    setMessages((prev) => [payload, ...prev])
  }

  return {
    messages,
    addMessage,
    receiverFilter,
    setReceiverFilter,
    filteredMessages,
  }
}
