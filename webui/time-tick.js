const TIME_TICK_MS = 60 * 1000

const listeners = new Set()
let timer = null

const emitTick = () => {
  const now = new Date()
  const snapshot = [...listeners]
  for (const listener of snapshot) {
    try {
      listener(now)
    } catch (error) {
      console.warn('[webui] time tick listener failed', error)
    }
  }
}

const ensureTimer = () => {
  if (timer !== null) return
  if (listeners.size === 0) return
  timer = window.setInterval(emitTick, TIME_TICK_MS)
}

const clearTimerIfIdle = () => {
  if (listeners.size > 0 || timer === null) return
  window.clearInterval(timer)
  timer = null
}

export const subscribeTimeTick = (listener, options = {}) => {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  ensureTimer()
  if (options.immediate === true) listener(new Date())
  return () => {
    listeners.delete(listener)
    clearTimerIfIdle()
  }
}

