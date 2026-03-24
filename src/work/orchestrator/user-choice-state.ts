import { parseIsoMs } from '../../foundation/shared/time.js'

import type {
  PendingUserChoice,
  UserChoiceOption,
} from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export const clonePendingUserChoice = (
  value: PendingUserChoice | null,
): PendingUserChoice | null =>
  value
    ? {
        ...value,
        options: value.options.map((item) => ({ ...item })),
        ...(value.effect ? { effect: { ...value.effect } } : {}),
      }
    : null

export const clonePendingUserChoices = (
  values: PendingUserChoice[],
): PendingUserChoice[] =>
  values
    .map((item) => clonePendingUserChoice(item))
    .filter((item): item is PendingUserChoice => item !== null)

const findPendingUserChoiceIndex = (
  runtime: RuntimeState,
  choiceId: string,
): number =>
  runtime.ui.pendingUserChoices.findIndex((item) => item.id === choiceId)

export const putPendingUserChoice = (
  runtime: RuntimeState,
  choice: PendingUserChoice,
): PendingUserChoice => {
  const index = findPendingUserChoiceIndex(runtime, choice.id)
  if (index >= 0) runtime.ui.pendingUserChoices[index] = choice
  else runtime.ui.pendingUserChoices.push(choice)
  return choice
}

export const removePendingUserChoice = (
  runtime: RuntimeState,
  choiceId: string,
): PendingUserChoice | null => {
  const index = findPendingUserChoiceIndex(runtime, choiceId)
  if (index < 0) return null
  const [choice] = runtime.ui.pendingUserChoices.splice(index, 1)
  return choice ?? null
}

export const isPendingUserChoiceExpired = (
  choice: PendingUserChoice,
  nowMs: number,
): boolean => {
  if (!choice.expiresAt) return false
  const expiresAtMs = parseIsoMs(choice.expiresAt)
  if (expiresAtMs === undefined) return false
  return nowMs >= expiresAtMs
}

export const resolvePendingUserChoiceOption = (
  choice: PendingUserChoice,
  optionId: string,
): UserChoiceOption | undefined =>
  choice.options.find((item) => item.id === optionId)

export const resolvePendingUserChoiceDefaultOption = (
  choice: PendingUserChoice,
): UserChoiceOption | undefined =>
  choice.options.find((item) => item.id === choice.defaultOptionId)
