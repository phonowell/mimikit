import { normalizeUsage } from '../../foundation/shared/utils.js'

import { normalizeCodexOutputSchema } from './codex-sdk-provider-helpers.js'
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

const normalizeLiveText = (value: string): string =>
  value.replace(/\r\n?/g, '\n')

const buildTodoListLiveOutput = (item: Record<string, unknown>): string => {
  const items = Array.isArray(item.items) ? item.items : []
  const lines = items
    .map((entry) => {
      const next = asRecord(entry)
      const text = asString(next, 'text')?.trim()
      if (!text) return ''
      const completed = next?.completed === true ? 'x' : ' '
      return `[${completed}] ${text}`
    })
    .filter(Boolean)
  return lines.join('\n')
}

const buildCommandLiveOutput = (item: Record<string, unknown>): string => {
  const command = asString(item, 'command')?.trim() ?? ''
  const aggregatedOutput = normalizeLiveText(
    asString(item, 'aggregated_output') ?? '',
  ).trim()
  if (command && aggregatedOutput) return `$ ${command}\n${aggregatedOutput}`
  if (command) return `$ ${command}`
  return aggregatedOutput
}

const buildToolCallLiveOutput = (item: Record<string, unknown>): string => {
  const server = asString(item, 'server')?.trim() ?? ''
  const tool = asString(item, 'tool')?.trim() ?? ''
  const status = asString(item, 'status')?.trim() ?? ''
  const target = [server, tool].filter(Boolean).join('/')
  if (!target) return ''
  if (status === 'failed') {
    const error = asString(asRecord(item.error), 'message')?.trim() ?? ''
    return error ? `tool failed: ${target}\n${error}` : `tool failed: ${target}`
  }
  if (status === 'completed') return `tool completed: ${target}`
  return `tool running: ${target}`
}

const buildFileChangeLiveOutput = (item: Record<string, unknown>): string => {
  const changes = Array.isArray(item.changes) ? item.changes : []
  const paths = changes
    .map((entry) => asString(asRecord(entry), 'path')?.trim() ?? '')
    .filter(Boolean)
  const status = asString(item, 'status')?.trim() ?? ''
  if (paths.length === 0) return ''
  const prefix =
    status === 'failed'
      ? 'file change failed'
      : status === 'completed'
        ? 'file change completed'
        : 'file change'
  return `${prefix}: ${paths.join(', ')}`
}

const buildLiveOutputFromItem = (item: Record<string, unknown>): string => {
  const itemType = asString(item, 'type')
  if (!itemType) return ''
  if (itemType === 'agent_message' || itemType === 'reasoning')
    return normalizeLiveText(asString(item, 'text') ?? '').trim()
  if (itemType === 'command_execution') return buildCommandLiveOutput(item)
  if (itemType === 'todo_list') return buildTodoListLiveOutput(item)
  if (itemType === 'mcp_tool_call') return buildToolCallLiveOutput(item)
  if (itemType === 'web_search') {
    const query = asString(item, 'query')?.trim() ?? ''
    return query ? `web search: ${query}` : ''
  }
  if (itemType === 'file_change') return buildFileChangeLiveOutput(item)
  if (itemType === 'error')
    return normalizeLiveText(asString(item, 'message') ?? '').trim()
  return ''
}

export const runCodexStream = async (
  thread: CodexThread,
  request: CodexSdkProviderRequest,
  signal: AbortSignal,
  resetIdle: () => void,
): Promise<StreamResult> => {
  const outputSchema = normalizeCodexOutputSchema(request.outputSchema)
  const stream = await thread.runStreamed(request.prompt, {
    ...(outputSchema ? { outputSchema } : {}),
    signal,
  })
  request.onTurnStarted?.()
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
    if (
      eventType === 'item.started' ||
      eventType === 'item.updated' ||
      eventType === 'item.completed'
    ) {
      const item = asRecord(event?.item)
      if (!item) continue
      const itemType = asString(item, 'type')
      const liveOutput = buildLiveOutputFromItem(item)
      if (liveOutput) {
        emitPartialOutput(
          liveOutput,
          eventType === 'item.completed' ? 'force' : 'throttled',
        )
      }
      if (itemType === 'agent_message') {
        const nextOutput = asString(item, 'text') ?? ''
        latestOutput = nextOutput
        if (eventType === 'item.completed') output = nextOutput
      }
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
