const FRAME_MS = 16

const scheduleFrame = (callback) => {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  )
    return window.requestAnimationFrame(callback)
  return setTimeout(() => callback(Date.now()), FRAME_MS)
}

const cancelFrame = (handle) => {
  if (handle === null || handle === undefined) return
  if (
    typeof window !== 'undefined' &&
    typeof window.cancelAnimationFrame === 'function'
  ) {
    window.cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}

export const createControllerQueue = ({
  applySnapshot,
  applyTasksSnapshot,
}) => {
  const pendingEvents = []
  let pendingFrame = null

  const flushPendingEvents = () => {
    pendingFrame = null
    if (pendingEvents.length === 0) return

    let latestTasksSnapshot = null
    const flushLatestTasksSnapshot = () => {
      if (!latestTasksSnapshot) return
      applyTasksSnapshot(latestTasksSnapshot)
      latestTasksSnapshot = null
    }
    for (const event of pendingEvents) {
      if (event.type === 'snapshot') {
        flushLatestTasksSnapshot()
        applySnapshot(event.payload)
        continue
      }
      if (event.type === 'tasks') latestTasksSnapshot = event.payload
    }
    pendingEvents.length = 0
    flushLatestTasksSnapshot()
  }

  const enqueueEvent = (event) => {
    pendingEvents.push(event)
    if (pendingFrame !== null) return
    pendingFrame = scheduleFrame(flushPendingEvents)
  }

  const clearPendingEvents = () => {
    if (pendingFrame !== null) {
      cancelFrame(pendingFrame)
      pendingFrame = null
    }
    pendingEvents.length = 0
  }

  return { enqueueEvent, clearPendingEvents }
}
