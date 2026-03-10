import { appendLog } from '../../log/append.js'
import {
  createSystemEventRecord,
  type SystemEventName,
} from '../../shared/system-event.js'
import { newId } from '../../shared/utils.js'
import { publishUserInput } from '../../streams/queues.js'

import type { RuntimeState } from './runtime-state.js'
import type {
  PendingUserChoice,
  UserChoiceOption,
  UserChoiceSelectionSource,
} from '../../types/index.js'

type PublishedChoiceEffectResult = {
  ok: boolean
  status: 'pending' | 'not_found' | 'already_done' | 'not_paused' | 'invalid'
}

const resolveTimeoutSummary = (
  choice: PendingUserChoice,
  option: UserChoiceOption,
): string =>
  `No selection was made for "${choice.question}" within 5 minutes. Applied default option "${option.label}".`

const resolveUserSummary = (
  choice: PendingUserChoice,
  option: UserChoiceOption,
): string => `Selected option "${option.label}" for "${choice.question}".`

const resolveSkipSummary = (choice: PendingUserChoice): string =>
  `Received a new user message before selecting an option for "${choice.question}". Canceled this choice as no option selected.`

const publishSystemInput = async (params: {
  runtime: RuntimeState
  focusId: string
  createdAt: string
  summary: string
  event: SystemEventName
  payload: Record<string, unknown>
  buildLogEntry: (inputId: string) => Record<string, unknown>
}): Promise<string> => {
  const eventRecord = createSystemEventRecord({
    summary: params.summary,
    event: params.event,
    payload: params.payload,
  })
  const input = {
    id: `input-${newId()}`,
    role: 'system' as const,
    visibility: 'all' as const,
    ...eventRecord,
    createdAt: params.createdAt,
    focusId: params.focusId,
  }
  await publishUserInput({
    paths: params.runtime.paths,
    payload: input,
  })
  params.runtime.session.inflightInputs.push(input)
  await appendLog(params.runtime.paths.log, params.buildLogEntry(input.id))
  return input.id
}

export const publishChoiceSelectionInput = (params: {
  runtime: RuntimeState
  choice: PendingUserChoice
  option: UserChoiceOption
  source: UserChoiceSelectionSource
  selectedAt: string
  effectResult?: PublishedChoiceEffectResult
}): Promise<string> =>
  publishSystemInput({
    runtime: params.runtime,
    focusId: params.choice.focusId,
    createdAt: params.selectedAt,
    summary:
      params.source === 'timeout'
        ? resolveTimeoutSummary(params.choice, params.option)
        : resolveUserSummary(params.choice, params.option),
    event: 'user_choice',
    payload: {
      choice_id: params.choice.id,
      question: params.choice.question,
      selected_option_id: params.option.id,
      selected_option_label: params.option.label,
      selected_option_reason: params.option.reason,
      default_option_id: params.choice.defaultOptionId,
      ...(params.choice.effect
        ? {
            choice_effect_type: params.choice.effect.type,
            choice_effect_task_id: params.choice.effect.taskId,
          }
        : {}),
      ...(params.effectResult
        ? {
            choice_effect_ok: params.effectResult.ok,
            choice_effect_status: params.effectResult.status,
          }
        : {}),
      source: params.source,
      selected_at: params.selectedAt,
    },
    buildLogEntry: (inputId) => ({
      event:
        params.source === 'timeout'
          ? 'user_choice_timeout_default'
          : 'user_choice',
      inputId,
      choiceId: params.choice.id,
      optionId: params.option.id,
      ...(params.choice.effect
        ? {
            effectType: params.choice.effect.type,
            effectTaskId: params.choice.effect.taskId,
          }
        : {}),
      ...(params.effectResult
        ? {
            effectOk: params.effectResult.ok,
            effectStatus: params.effectResult.status,
          }
        : {}),
      source: params.source,
    }),
  })

export const publishChoiceSkippedInput = (params: {
  runtime: RuntimeState
  choice: PendingUserChoice
  canceledAt: string
  triggerInputId: string
}): Promise<string> =>
  publishSystemInput({
    runtime: params.runtime,
    focusId: params.choice.focusId,
    createdAt: params.canceledAt,
    summary: resolveSkipSummary(params.choice),
    event: 'user_choice_skipped',
    payload: {
      choice_id: params.choice.id,
      question: params.choice.question,
      default_option_id: params.choice.defaultOptionId,
      source: 'user_input',
      trigger_input_id: params.triggerInputId,
      canceled_at: params.canceledAt,
    },
    buildLogEntry: (inputId) => ({
      event: 'user_choice_skipped',
      inputId,
      choiceId: params.choice.id,
      source: 'user_input',
      triggerInputId: params.triggerInputId,
    }),
  })
