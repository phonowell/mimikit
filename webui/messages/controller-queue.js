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

  const flushStreamPatches = (streamPatches) => {
    const mergedStreamPatches = mergeStreamPatches(streamPatches)
    streamPatches.length = 0
    if (mergedStreamPatches.length === 0) return
    let nextStreamMessage = getCurrentStreamMessage()
    for (const patch of mergedStreamPatches)
      nextStreamMessage = applyStreamPatch(nextStreamMessage, patch)
    setCurrentStreamMessage(nextStreamMessage)
    applyMessagesPayload(null, nextStreamMessage)
  }

  const flushPendingEvents = () => {
    pendingFrame = null
    if (pendingEvents.length === 0) return

    const streamPatches = []
    for (const event of pendingEvents) {
      if (event.type === 'snapshot') {
        flushStreamPatches(streamPatches)
        applySnapshot(event.payload)
        continue
      }
      if (event.type === 'stream') streamPatches.push(event.payload)
    }
    pendingEvents.length = 0
    flushStreamPatches(streamPatches)
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
