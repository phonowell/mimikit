import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import {
  formatSystemEventText,
  type SystemEventName,
} from '../shared/system-event.js'
import { newId } from '../shared/utils.js'
import { publishUserInput } from '../streams/queues.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { MessageVisibility } from '../types/index.js'

export type ManagerSystemEventName = Extract<
  SystemEventName,
  'cron_trigger' | 'idle'
>

export const formatManagerSystemEventText = (params: {
  summary: string
  event: ManagerSystemEventName
  payload: Record<string, unknown>
}): string =>
  formatSystemEventText({
    summary: params.summary,
    event: params.event,
    payload: params.payload,
  })

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
