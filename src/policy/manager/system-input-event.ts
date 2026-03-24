import { newId } from '../../foundation/shared/utils.js'
import { publishUserInput } from '../../kernel/streams/queues.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  createSystemEventRecord,
  type SystemEventName,
} from '../../surface/shared/system-event.js'
import { GLOBAL_FOCUS_ID } from '../../work/focus/index.js'

import type {
  FocusId,
  MessageVisibility,
} from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

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
