import { parseSnapshot } from './controller-stream.js'

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
    if (eventSource) return
    const source = new EventSource(eventsUrl)

    source.onopen = () => {
      reconnectAttempts = 0
    }

    source.addEventListener('snapshot', (event) => {
      const snapshot = parseSnapshot(event.data)
      if (!snapshot) return
      onSnapshotEvent(snapshot)
    })
    source.addEventListener('stream', (event) => {
      const patch = parseSnapshot(event.data)
      if (!patch) return
      onStreamEvent(patch)
    })
    source.addEventListener('error', (event) => {
      const payload = parseSnapshot(event.data)
      if (!payload || typeof payload.error !== 'string' || !payload.error.trim())
        return
      console.warn('[webui] stream error', payload.error)
    })
    source.onerror = () => {
      if (eventSource !== source) return
      onDisconnected()
      source.close()
      eventSource = null
      scheduleReconnect()
    }

    eventSource = source
  }

  const start = () => {
    reconnectAttempts = 0
    openEvents()
  }

  return {
    start,
    stop: closeEvents,
  }
}
