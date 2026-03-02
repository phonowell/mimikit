import { appendLog } from '../../log/append.js'
import { parseIsoMs } from '../../shared/time.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso } from '../../shared/utils.js'
import { publishUserInput } from '../../streams/queues.js'

import type { RuntimeState } from './runtime-state.js'
import type {
  PendingUserChoice,
  UserChoiceOption,
  UserChoiceSelectionSource,
} from '../../types/index.js'

export const USER_CHOICE_TIMEOUT_MS = 5 * 60 * 1000

export type SelectPendingUserChoiceResult =
  | {
      ok: true
      choiceId: string
      optionId: string
      source: UserChoiceSelectionSource
    }
  | { ok: false; reason: 'not_found' | 'invalid_option' | 'expired' }

export const clonePendingUserChoice = (
  value: PendingUserChoice | null,
): PendingUserChoice | null =>
  value
    ? {
        ...value,
        options: value.options.map((item) => ({ ...item })),
      }
    : null

const resolveTimeoutSummary = (
  choice: PendingUserChoice,
  option: UserChoiceOption,
): string =>
  `No selection was made for "${choice.question}" within 5 minutes. Applied default option "${option.label}".`

const resolveUserSummary = (
  choice: PendingUserChoice,
  option: UserChoiceOption,
): string => `Selected option "${option.label}" for "${choice.question}".`

const publishChoiceSystemInput = async (params: {
  runtime: RuntimeState
  choice: PendingUserChoice
  option: UserChoiceOption
  source: UserChoiceSelectionSource
  selectedAt: string
}): Promise<string> => {
  const { runtime, choice, option, source, selectedAt } = params
  const input = {
    id: `input-${newId()}`,
    role: 'system' as const,
    visibility: 'all' as const,
    text: formatSystemEventText({
      summary:
        source === 'timeout'
          ? resolveTimeoutSummary(choice, option)
          : resolveUserSummary(choice, option),
      event: 'user_choice',
      payload: {
        choice_id: choice.id,
        question: choice.question,
        selected_option_id: option.id,
        selected_option_label: option.label,
        selected_option_reason: option.reason,
        default_option_id: choice.defaultOptionId,
        source,
        selected_at: selectedAt,
      },
    }),
    createdAt: selectedAt,
    focusId: choice.focusId,
  }
  await publishUserInput({
    paths: runtime.paths,
    payload: input,
  })
  runtime.inflightInputs.push(input)
  await appendLog(runtime.paths.log, {
    event: source === 'timeout' ? 'user_choice_timeout_default' : 'user_choice',
    inputId: input.id,
    choiceId: choice.id,
    optionId: option.id,
    source,
  })
  return input.id
}

const isExpired = (choice: PendingUserChoice, nowMs: number): boolean => {
  const expiresAtMs = parseIsoMs(choice.expiresAt)
  if (expiresAtMs === undefined) return false
  return nowMs >= expiresAtMs
}

const resolveOption = (
  choice: PendingUserChoice,
  optionId: string,
): UserChoiceOption | undefined =>
  choice.options.find((item) => item.id === optionId)

const resolveDefaultOption = (
  choice: PendingUserChoice,
): UserChoiceOption | undefined =>
  choice.options.find((item) => item.id === choice.defaultOptionId)

const commitSelection = async (params: {
  runtime: RuntimeState
  choice: PendingUserChoice
  option: UserChoiceOption
  source: UserChoiceSelectionSource
  selectedAt: string
}): Promise<SelectPendingUserChoiceResult> => {
  await publishChoiceSystemInput(params)
  params.runtime.pendingUserChoice = null
  return {
    ok: true,
    choiceId: params.choice.id,
    optionId: params.option.id,
    source: params.source,
  }
}

export const selectPendingUserChoice = async (params: {
  runtime: RuntimeState
  choiceId: string
  optionId: string
  source: UserChoiceSelectionSource
  selectedAt?: string
}): Promise<SelectPendingUserChoiceResult> => {
  const { runtime, choiceId, optionId, source } = params
  const choice = runtime.pendingUserChoice
  if (!choice || choice.id !== choiceId) return { ok: false, reason: 'not_found' }

  const selectedAt = params.selectedAt ?? nowIso()
  const nowMs = Date.parse(selectedAt)
  if (
    source === 'user' &&
    Number.isFinite(nowMs) &&
    isExpired(choice, Number(nowMs))
  ) {
    const defaultOption = resolveDefaultOption(choice)
    if (defaultOption) {
      await commitSelection({
        runtime,
        choice,
        option: defaultOption,
        source: 'timeout',
        selectedAt,
      })
    } else runtime.pendingUserChoice = null
    return { ok: false, reason: 'expired' }
  }

  const option = resolveOption(choice, optionId)
  if (!option) return { ok: false, reason: 'invalid_option' }

  return commitSelection({
    runtime,
    choice,
    option,
    source,
    selectedAt,
  })
}

export const resolvePendingUserChoiceTimeout = async (
  runtime: RuntimeState,
  nowMs: number = Date.now(),
): Promise<boolean> => {
  const choice = runtime.pendingUserChoice
  if (!choice) return false
  if (!isExpired(choice, nowMs)) return false
  const defaultOption = resolveDefaultOption(choice)
  if (!defaultOption) {
    runtime.pendingUserChoice = null
    return true
  }
  const result = await selectPendingUserChoice({
    runtime,
    choiceId: choice.id,
    optionId: defaultOption.id,
    source: 'timeout',
    selectedAt: new Date(nowMs).toISOString(),
  })
  return result.ok
}
