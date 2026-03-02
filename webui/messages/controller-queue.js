import {
  applyStreamPatch,
  cancelFrame,
  mergeStreamPatches,
  scheduleFrame,
} from './controller-stream.js'

export const createControllerQueue = ({
  applySnapshot,
  applyMessagesPayload,
  getCurrentStreamMessage,
  setCurrentStreamMessage,
}) => {
  const pendingEvents = []
  let pendingFrame = null

  const flushPendingEvents = () => {
    pendingFrame = null
    if (pendingEvents.length === 0) return

    let lastSnapshot = null
    const streamPatches = []
    for (const event of pendingEvents) {
      if (event.type === 'snapshot') {
        lastSnapshot = event.payload
        streamPatches.length = 0
        continue
      }
      if (event.type === 'stream') streamPatches.push(event.payload)
    }
    pendingEvents.length = 0

    if (lastSnapshot) applySnapshot(lastSnapshot)
    const mergedStreamPatches = mergeStreamPatches(streamPatches)
    if (mergedStreamPatches.length === 0) return
    let nextStreamMessage = getCurrentStreamMessage()
    for (const patch of mergedStreamPatches)
      nextStreamMessage = applyStreamPatch(nextStreamMessage, patch)
    setCurrentStreamMessage(nextStreamMessage)
    applyMessagesPayload(null, nextStreamMessage)
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
