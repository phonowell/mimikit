import { normalizeUsage } from '../shared/utils.js'

import type { CodexSdkProviderRequest } from './types.js'

type CodexThread = {
  runStreamed: (
    prompt: string,
    options: { outputSchema?: unknown; signal: AbortSignal },
  ) => Promise<{ events: AsyncIterable<unknown> }>
  id?: string | null
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value ? (value as Record<string, unknown>) : null

const asString = (
  value: Record<string, unknown> | null,
  key: string,
): string | undefined => {
  if (!value) return undefined
  const target = value[key]
  return typeof target === 'string' ? target : undefined
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
  let streamedOutput = ''
  let usage: ReturnType<typeof normalizeUsage> | undefined
  for await (const rawEvent of stream.events) {
    const event = asRecord(rawEvent)
    const eventType = asString(event, 'type')
    if (!eventType) continue
    resetIdle()
    if (eventType === 'item.updated' || eventType === 'item.completed') {
      const item = asRecord(event?.item)
      if (asString(item, 'type') !== 'agent_message') continue
      const nextOutput = asString(item, 'text') ?? ''
      if (request.onTextDelta) {
        const delta = nextOutput.startsWith(streamedOutput)
          ? nextOutput.slice(streamedOutput.length)
          : nextOutput
        if (delta) request.onTextDelta(delta)
      }
      streamedOutput = nextOutput
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
  return { output, ...(usage ? { usage } : {}) }
}
