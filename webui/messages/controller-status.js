import { applyStatus } from '../status.js'

import { clearWorkerDots, updateWorkerDots } from './worker-dots.js'

export const updateControllerStatus = (params) => {
  const {
    status,
    statusDot,
    statusText,
    workerDots,
    setLastStatus,
    syncLoadingState,
  } = params
  setLastStatus(status)
  applyStatus({ statusDot, statusText }, status.agentStatus)
  updateWorkerDots(workerDots, status)
  syncLoadingState()
}

export const mergeIncomingMessages = (params) => {
  const { mode, lastMessages, incoming, limit } = params
  const merged =
    mode === 'delta' && lastMessages.length > 0
      ? [...lastMessages, ...incoming]
      : incoming
  return merged.slice(Math.max(0, merged.length - limit))
}

export const disconnectMessages = (params) => {
  const {
    statusDot,
    statusText,
    workerDots,
    messageState,
    loading,
    setLastStatus,
  } = params
  applyStatus({ statusDot, statusText }, 'disconnected')
  setLastStatus(null)
  clearWorkerDots(workerDots)
  messageState.awaitingReply = false
  loading.setLoading(false)
}

export const createDisconnectHandler = (params) => () => {
  disconnectMessages(params)
}

export const isStatusFullyIdle = (status) =>
  status &&
  status.agentStatus === 'idle' &&
  !(status.activeTasks ?? 0) &&
  !(status.pendingTasks ?? 0)
