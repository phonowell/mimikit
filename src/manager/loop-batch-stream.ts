import { resetUiStream, setUiStreamText, setUiStreamUsage, toVisibleAgentText } from './loop-ui-stream.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TokenUsage } from '../types/index.js'

const STREAM_TEXT_FLUSH_MS = 64

export const createManagerStreamController = (params: {
  runtime: RuntimeState
  streamId: string
}) => {
  let streamRawOutput = ''
  let streamVisibleOutput = ''
  let streamUsage: TokenUsage | undefined
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null

  const clearStreamFlushTimer = (): void => {
    if (!streamFlushTimer) return
    clearTimeout(streamFlushTimer)
    streamFlushTimer = null
  }

  const flushVisibleStream = (): void => {
    streamFlushTimer = null
    const nextVisible = toVisibleAgentText(streamRawOutput)
    if (nextVisible !== streamVisibleOutput) {
      streamVisibleOutput = nextVisible
      setUiStreamText(params.runtime, params.streamId, nextVisible)
    }
    if (!streamUsage) return
    streamUsage =
      setUiStreamUsage(params.runtime, params.streamId, streamUsage) ??
      streamUsage
  }

  const scheduleVisibleStreamFlush = (): void => {
    if (streamFlushTimer) return
    streamFlushTimer = setTimeout(flushVisibleStream, STREAM_TEXT_FLUSH_MS)
  }

  return {
    appendDelta: (delta: string): void => {
      if (!delta) return
      streamRawOutput += delta
      scheduleVisibleStreamFlush()
    },
    setUsage: (usage: TokenUsage): void => {
      streamUsage = usage
      scheduleVisibleStreamFlush()
    },
    commitParsedText: (text: string): void => {
      clearStreamFlushTimer()
      flushVisibleStream()
      if (streamVisibleOutput === text) return
      streamVisibleOutput = text
      setUiStreamText(params.runtime, params.streamId, text)
    },
    resetCycle: (): void => {
      clearStreamFlushTimer()
      flushVisibleStream()
      streamRawOutput = ''
      streamVisibleOutput = ''
      resetUiStream(params.runtime, params.streamId)
    },
    teardown: clearStreamFlushTimer,
  }
}
