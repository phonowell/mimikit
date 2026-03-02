export const createSseController = ({
  eventsUrl,
  reconnectBaseDelayMs,
  reconnectMaxDelayMs,
  isStarted,
  onSnapshotEvent,
  onStreamEvent,
  onDisconnected,
}) => {
  let eventSource = null
  let reconnectTimer = null
  let reconnectAttempts = 0
  let generation = 0

  const parseJsonRecord = (raw) => {
    if (!raw || typeof raw !== 'string') return null
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const closeEvents = () => {
    clearReconnectTimer()
    if (!eventSource) return
    eventSource.close()
    eventSource = null
  }

  const scheduleReconnect = () => {
    if (!isStarted() || eventSource || reconnectTimer !== null) return
    const delayMs = Math.min(
      reconnectMaxDelayMs,
      reconnectBaseDelayMs * Math.max(1, 2 ** reconnectAttempts),
    )
    reconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!isStarted() || eventSource) return
      openEvents()
    }, delayMs)
  }

  function openEvents() {
    if (!isStarted() || eventSource) return
    const currentGeneration = generation
    const source = new EventSource(eventsUrl)

    source.onopen = () => {
      if (currentGeneration !== generation || eventSource !== source) return
      reconnectAttempts = 0
    }

    source.addEventListener('snapshot', (event) => {
      if (currentGeneration !== generation || eventSource !== source) return
      const snapshot = parseJsonRecord(event.data)
      if (!snapshot) return
      onSnapshotEvent(snapshot)
    })
    source.addEventListener('stream', (event) => {
      if (currentGeneration !== generation || eventSource !== source) return
      const patch = parseJsonRecord(event.data)
      if (!patch) return
      onStreamEvent(patch)
    })
    source.addEventListener('error', (event) => {
      if (currentGeneration !== generation || eventSource !== source) return
      const payload = parseJsonRecord(event.data)
      if (!payload || typeof payload.error !== 'string' || !payload.error.trim())
        return
      console.warn('[webui] stream error', payload.error)
    })
    source.onerror = () => {
      if (currentGeneration !== generation || eventSource !== source) return
      onDisconnected()
      source.close()
      eventSource = null
      scheduleReconnect()
    }

    eventSource = source
  }

  const start = () => {
    clearReconnectTimer()
    reconnectAttempts = 0
    generation += 1
    openEvents()
  }

  return {
    start,
    stop: () => {
      generation += 1
      closeEvents()
    },
  }
}
