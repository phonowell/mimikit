import { parseIsoMs } from '../../shared/time.js'
import { nowIso } from '../../shared/utils.js'

import { notifyManagerLoop, notifyUiSignal } from './signals.js'
import {
  publishChoiceSelectionInput,
  publishChoiceSkippedInput,
} from './user-choice-input.js'

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

export const cancelPendingUserChoiceByUserInput = async (params: {
  runtime: RuntimeState
  triggerInputId: string
  createdAt?: string
}): Promise<boolean> => {
  const { runtime, triggerInputId } = params
  const choice = runtime.ui.pendingUserChoice
  if (!choice) return false
  const canceledAt = params.createdAt ?? nowIso()
  runtime.ui.pendingUserChoice = null
  await publishChoiceSkippedInput({
    runtime,
    choice,
    canceledAt,
    triggerInputId,
  })
  return true
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
  await publishChoiceSelectionInput(params)
  params.runtime.ui.pendingUserChoice = null
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
  const choice = runtime.ui.pendingUserChoice
  if (choice?.id !== choiceId) return { ok: false, reason: 'not_found' }

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
    } else runtime.ui.pendingUserChoice = null
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

export const selectPendingUserChoiceFromUser = async (
  runtime: RuntimeState,
  choiceId: string,
  optionId: string,
): Promise<SelectPendingUserChoiceResult> => {
  const result = await selectPendingUserChoice({
    runtime,
    choiceId,
    optionId,
    source: 'user',
  })
  if (result.ok || result.reason === 'expired') {
    notifyUiSignal(runtime)
    notifyManagerLoop(runtime)
  }
  return result
}

export const resolvePendingUserChoiceTimeout = async (
  runtime: RuntimeState,
  nowMs: number = Date.now(),
): Promise<boolean> => {
  const choice = runtime.ui.pendingUserChoice
  if (!choice) return false
  if (!isExpired(choice, nowMs)) return false
  const defaultOption = resolveDefaultOption(choice)
  if (!defaultOption) {
    runtime.ui.pendingUserChoice = null
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
