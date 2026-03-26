import { newId } from '../../foundation/shared/utils.js'
import { publishUserInput } from '../../kernel/streams/queues.js'
import { appendLog } from '../../persistence/log/append.js'
import {
  createSystemEventRecord,
  type SystemEventName,
} from '../../surface/shared/system-event.js'

import type {
  PendingUserChoice,
  UserChoiceOption,
  UserChoiceSelectionSource,
} from '../../foundation/types/index.js'
import type { OrchestratorRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

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
  runtime: OrchestratorRuntime
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
  runtime: OrchestratorRuntime
  choice: PendingUserChoice
  option: UserChoiceOption
  source: UserChoiceSelectionSource
  selectedAt: string
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
      source: params.source,
    }),
  })

export const publishChoiceSkippedInput = (params: {
  runtime: OrchestratorRuntime
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
