import { GLOBAL_FOCUS_ID } from '../focus/index.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import {
  createSystemEventRecord,
  type SystemEventName,
} from '../shared/system-event.js'
import { newId } from '../shared/utils.js'
import { publishUserInput } from '../streams/queues.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { FocusId, MessageVisibility } from '../types/index.js'

export type ManagerSystemEventName = Extract<
  SystemEventName,
  'trigger_fire' | 'worker_slot_freed'
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
  const focusId = params.focusId ?? GLOBAL_FOCUS_ID
  const eventRecord = createSystemEventRecord({
    summary: params.summary,
    event: params.event,
    payload: params.payload,
  })
  const input = {
    id: `input-${newId()}`,
    role: 'system' as const,
    visibility: params.visibility,
    ...eventRecord,
    createdAt: params.createdAt,
    focusId,
  }
  await publishUserInput({
    paths: params.runtime.paths,
    payload: input,
  })
  params.runtime.session.inflightInputs.push(input)
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
