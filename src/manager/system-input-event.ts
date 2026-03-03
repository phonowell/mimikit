import { resolveDefaultFocusId } from '../focus/index.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import {
  formatSystemEventText,
  type SystemEventName,
} from '../shared/system-event.js'
import { newId } from '../shared/utils.js'
import { publishUserInput } from '../streams/queues.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { FocusId, MessageVisibility } from '../types/index.js'

export type ManagerSystemEventName = Extract<
  SystemEventName,
  'trigger_fire' | 'idle' | 'worker_slot_available'
>

export const publishManagerSystemEventInput = async (params: {
  runtime: RuntimeState
  summary: string
  event: ManagerSystemEventName
  visibility: MessageVisibility
  payload: Record<string, unknown>
  createdAt: string
  logEvent: string
  logMeta?: Record<string, unknown>
  focusId?: FocusId
}): Promise<string> => {
  const focusId = params.focusId ?? resolveDefaultFocusId(params.runtime)
  const input = {
    id: `input-${newId()}`,
    role: 'system' as const,
    visibility: params.visibility,
    text: formatSystemEventText({
      summary: params.summary,
      event: params.event,
      payload: params.payload,
    }),
    createdAt: params.createdAt,
    focusId,
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
      focusId,
      ...(params.logMeta ?? {}),
    }),
  )
  return input.id
}
