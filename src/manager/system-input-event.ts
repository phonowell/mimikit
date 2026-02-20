import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { newId } from '../shared/utils.js'
import { publishUserInput } from '../streams/queues.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { MessageVisibility } from '../types/index.js'

export type ManagerSystemEventName = 'cron_trigger' | 'idle'

const toInlineJson = (payload: Record<string, unknown>): string =>
  JSON.stringify(payload).replace(/[<>&]/g, (char) => {
    if (char === '<') return '\\u003c'
    if (char === '>') return '\\u003e'
    return '\\u0026'
  })

export const formatManagerSystemEventText = (params: {
  summary: string
  event: ManagerSystemEventName
  payload: Record<string, unknown>
}): string => {
  const summary = params.summary.trim()
  const metaTag = `<M:system_event name="${params.event}" version="1">${toInlineJson(params.payload)}</M:system_event>`
  if (!summary) return metaTag
  return `${summary}\n\n${metaTag}`
}

export const publishManagerSystemEventInput = async (params: {
  runtime: RuntimeState
  summary: string
  event: ManagerSystemEventName
  visibility: MessageVisibility
  payload: Record<string, unknown>
  createdAt: string
  logEvent: string
  logMeta?: Record<string, unknown>
}): Promise<string> => {
  const input = {
    id: newId(),
    role: 'system' as const,
    visibility: params.visibility,
    text: formatManagerSystemEventText({
      summary: params.summary,
      event: params.event,
      payload: params.payload,
    }),
    createdAt: params.createdAt,
  }
  await publishUserInput({
    paths: params.runtime.paths,
    payload: input,
  })
  params.runtime.inflightInputs.push(input)
  await bestEffort(`appendLog: ${params.logEvent}`, () =>
    appendLog(params.runtime.paths.log, {
      event: params.logEvent,
      inputId: input.id,
      ...(params.logMeta ?? {}),
    }),
  )
  return input.id
}
