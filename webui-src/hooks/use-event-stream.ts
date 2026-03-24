import { startTransition, useEffect, useEffectEvent } from 'react'

import type { SnapshotEnvelope, TasksSnapshot } from '../types.js'

type Params = {
  onSnapshot: (snapshot: SnapshotEnvelope) => void
  onTasks: (tasks: TasksSnapshot) => void
  onDisconnected: () => void
}

const EVENTS_URL = '/api/events'
const RECONNECT_BASE_DELAY_MS = 1200
const RECONNECT_MAX_DELAY_MS = 12000

const parseJsonRecord = <T>(raw: string): T | null => {
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const useEventStream = ({
  onSnapshot,
  onTasks,
  onDisconnected,
}: Params): void => {
  const handleSnapshot = useEffectEvent((snapshot: SnapshotEnvelope) => {
    startTransition(() => {
      onSnapshot(snapshot)
    })
  })
  const handleTasks = useEffectEvent((tasks: TasksSnapshot) => {
    startTransition(() => {
      onTasks(tasks)
    })
  })
  const handleDisconnected = useEffectEvent(() => {
    onDisconnected()
  })

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempts = 0
    let stopped = false

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer !== null) return
      const delayMs = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * Math.max(1, 2 ** reconnectAttempts),
      )
      reconnectAttempts += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        open()
      }, delayMs)
    }

    const close = () => {
      clearReconnectTimer()
      eventSource?.close()
      eventSource = null
    }

    const open = () => {
      if (stopped || eventSource) return
      const source = new EventSource(EVENTS_URL)
      source.onopen = () => {
        reconnectAttempts = 0
      }
      source.addEventListener('snapshot', (event) => {
        const snapshot = parseJsonRecord<SnapshotEnvelope>(event.data)
        if (snapshot) handleSnapshot(snapshot)
      })
      source.addEventListener('tasks', (event) => {
        const tasks = parseJsonRecord<TasksSnapshot>(event.data)
        if (tasks) handleTasks(tasks)
      })
      source.onerror = () => {
        if (eventSource !== source) return
        handleDisconnected()
        source.close()
        eventSource = null
        scheduleReconnect()
      }
      eventSource = source
    }

    open()
    return () => {
      stopped = true
      close()
    }
  }, [handleDisconnected, handleSnapshot, handleTasks])
}
