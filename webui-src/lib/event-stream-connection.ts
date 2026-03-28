import type {
  FocusesSnapshot,
  PlansSnapshot,
  SnapshotEnvelope,
  TasksSnapshot,
} from '../types.js'

type EventStreamCallbacks = {
  onSnapshot: (snapshot: SnapshotEnvelope) => void
  onTasks: (tasks: TasksSnapshot) => void
  onPlans: (plans: PlansSnapshot) => void
  onFocuses: (focuses: FocusesSnapshot) => void
  onDisconnected: () => void
}

type EventStreamConnection = {
  stop: () => void
}

const EVENTS_URL = '/api/events'
const RECONNECT_BASE_DELAY_MS = 1200
const RECONNECT_MAX_DELAY_MS = 12000

export const EVENT_STREAM_STALE_AFTER_MS = 45_000
export const EVENT_STREAM_STALE_CHECK_MS = 5_000

const parseJsonRecord = <T>(raw: string): T | null => {
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const isDocumentVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

export const createEventStreamConnection = ({
  onSnapshot,
  onTasks,
  onPlans,
  onFocuses,
  onDisconnected,
}: EventStreamCallbacks): EventStreamConnection => {
  let eventSource: EventSource | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempts = 0
  let staleTimer: number | null = null
  let stopped = false
  let lastEventAtMs = Date.now()

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const clearStaleTimer = () => {
    if (staleTimer === null) return
    window.clearInterval(staleTimer)
    staleTimer = null
  }

  const markActivity = () => {
    lastEventAtMs = Date.now()
  }

  const isStale = (): boolean =>
    Date.now() - lastEventAtMs >= EVENT_STREAM_STALE_AFTER_MS

  const closeSource = () => {
    eventSource?.close()
    eventSource = null
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

  const recycleConnection = () => {
    onDisconnected()
    closeSource()
    scheduleReconnect()
  }

  const reopenConnection = () => {
    if (stopped) return
    if (
      eventSource &&
      eventSource.readyState === EventSource.OPEN &&
      !isStale()
    )
      return
    clearReconnectTimer()
    closeSource()
    open()
  }

  const open = () => {
    if (stopped || eventSource) return
    markActivity()
    const source = new EventSource(EVENTS_URL)
    source.onopen = () => {
      if (eventSource !== source) return
      reconnectAttempts = 0
      markActivity()
    }
    source.addEventListener('snapshot', (event) => {
      if (eventSource !== source) return
      markActivity()
      const snapshot = parseJsonRecord<SnapshotEnvelope>(event.data)
      if (snapshot) onSnapshot(snapshot)
    })
    source.addEventListener('tasks', (event) => {
      if (eventSource !== source) return
      markActivity()
      const tasks = parseJsonRecord<TasksSnapshot>(event.data)
      if (tasks) onTasks(tasks)
    })
    source.addEventListener('plans', (event) => {
      if (eventSource !== source) return
      markActivity()
      const plans = parseJsonRecord<PlansSnapshot>(event.data)
      if (plans) onPlans(plans)
    })
    source.addEventListener('focuses', (event) => {
      if (eventSource !== source) return
      markActivity()
      const focuses = parseJsonRecord<FocusesSnapshot>(event.data)
      if (focuses) onFocuses(focuses)
    })
    source.addEventListener('heartbeat', () => {
      if (eventSource !== source) return
      markActivity()
    })
    source.onerror = () => {
      if (eventSource !== source) return
      recycleConnection()
    }
    eventSource = source
  }

  const handleVisibilityChange = () => {
    if (!isDocumentVisible()) return
    reopenConnection()
  }

  const handleResume = () => {
    if (!isDocumentVisible()) return
    reopenConnection()
  }

  staleTimer = window.setInterval(() => {
    if (stopped || !eventSource) return
    if (!isDocumentVisible() || !isStale()) return
    recycleConnection()
  }, EVENT_STREAM_STALE_CHECK_MS)

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleResume)
  window.addEventListener('pageshow', handleResume)
  open()

  return {
    stop: () => {
      stopped = true
      clearReconnectTimer()
      clearStaleTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleResume)
      window.removeEventListener('pageshow', handleResume)
      closeSource()
    },
  }
}
