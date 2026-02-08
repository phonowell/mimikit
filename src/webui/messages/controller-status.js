import { applyStatus } from '../status.js'

import { clearMessageState } from './state.js'
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

export const buildMessagesUrl = (params) => {
  const { cursor, limit } = params
  const query = cursor
    ? `?limit=${limit}&afterId=${encodeURIComponent(cursor)}`
    : `?limit=${limit}`
  return `/api/messages${query}`
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
    cursors,
  } = params
  applyStatus({ statusDot, statusText }, 'disconnected')
  setLastStatus(null)
  clearWorkerDots(workerDots)
  clearMessageState(messageState)
  cursors.message.set(null)
  cursors.statusEtag.set(null)
  cursors.messagesEtag.set(null)
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
