import { applyStatus } from '../status.js'

import { updateWorkerDots } from './worker-dots.js'

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
  if (mode !== 'delta' || lastMessages.length === 0) 
    return incoming.slice(Math.max(0, incoming.length - limit))
  
  const merged = [...lastMessages]
  const indexById = new Map()
  for (let index = 0; index < merged.length; index += 1) {
    const id = merged[index]?.id
    if (id === null || id === undefined) continue
    indexById.set(String(id), index)
  }
  for (const message of incoming) {
    const id = message?.id
    if (id === null || id === undefined) {
      merged.push(message)
      continue
    }
    const idKey = String(id)
    const existingIndex = indexById.get(idKey)
    if (existingIndex === undefined) {
      indexById.set(idKey, merged.length)
      merged.push(message)
      continue
    }
    merged[existingIndex] = message
  }
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
  updateWorkerDots(workerDots, { agentStatus: 'disconnected' })
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
