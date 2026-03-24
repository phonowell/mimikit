import { normalizeUsage } from '../../foundation/shared/utils.js'

import { asRecord, asString } from './provider-payload.js'

import type { CodexSdkProviderRequest } from './types.js'

const PARTIAL_OUTPUT_EMIT_INTERVAL_MS = 400

type CodexThread = {
  runStreamed: (
    prompt: string,
    options: { outputSchema?: unknown; signal: AbortSignal },
  ) => Promise<{ events: AsyncIterable<unknown> }>
  id?: string | null
}

export type StreamResult = {
  output: string
  usage?: ReturnType<typeof normalizeUsage>
}

export const runCodexStream = async (
  thread: CodexThread,
  request: CodexSdkProviderRequest,
  signal: AbortSignal,
  resetIdle: () => void,
): Promise<StreamResult> => {
  const stream = await thread.runStreamed(request.prompt, {
    ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
    signal,
  })
  let output = ''
  let latestOutput = ''
  let emittedOutput = ''
  let lastEmitAtMs = 0
  let usage: ReturnType<typeof normalizeUsage> | undefined
  const emitPartialOutput = (
    text: string,
    mode: 'throttled' | 'force' = 'throttled',
  ): void => {
    if (!request.onPartialOutput) return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (!normalized || normalized === emittedOutput) return
    const nowMs = Date.now()
    if (
      mode === 'throttled' &&
      nowMs - lastEmitAtMs < PARTIAL_OUTPUT_EMIT_INTERVAL_MS
    )
      return
    emittedOutput = normalized
    lastEmitAtMs = nowMs
    request.onPartialOutput(normalized)
  }
  for await (const rawEvent of stream.events) {
    const event = asRecord(rawEvent)
    const eventType = asString(event, 'type')
    if (!eventType) continue
    resetIdle()
    if (eventType === 'item.updated' || eventType === 'item.completed') {
      const item = asRecord(event?.item)
      if (asString(item, 'type') !== 'agent_message') continue
      const nextOutput = asString(item, 'text') ?? ''
      latestOutput = nextOutput
      emitPartialOutput(
        nextOutput,
        eventType === 'item.completed' ? 'force' : 'throttled',
      )
      if (eventType === 'item.completed') output = nextOutput
      continue
    }
    if (eventType === 'turn.completed') {
      usage = normalizeUsage(event?.usage ?? null)
      if (usage) request.onUsage?.(usage)
      continue
    }
    if (eventType === 'turn.failed') {
      const error = asRecord(event?.error)
      throw new Error(asString(error, 'message') ?? 'codex_turn_failed')
    }
    if (eventType === 'error')
      throw new Error(asString(event, 'message') ?? 'codex_stream_error')
  }
  const finalOutput = output || latestOutput
  emitPartialOutput(finalOutput, 'force')
  return { output: finalOutput, ...(usage ? { usage } : {}) }
}
