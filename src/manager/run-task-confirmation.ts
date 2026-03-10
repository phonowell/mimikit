import { createHash } from 'node:crypto'

import { resolveSystemEvent } from '../shared/system-event.js'

import type { UserInput } from '../types/index.js'

export const RUN_TASK_CONFIRM_OPTION_ID = 'option-confirm-dispatch'
export const RUN_TASK_CANCEL_OPTION_ID = 'option-cancel-dispatch'

const HIGH_COST_PROMPT_CHARS = 1_200
const HIGH_COST_TOTAL_CHARS = 2_000
const HIGH_COST_ACCEPTANCE_COUNT = 3

const normalizeText = (value?: string): string => value?.trim() ?? ''

const escapeActionAttr = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const buildAskUserChoiceActionText = (params: {
  id: string
  question: string
  option1Id: string
  option1Label: string
  option1Reason: string
  option2Id: string
  option2Label: string
  option2Reason: string
  defaultOptionId: string
}): string => {
  const parts = [
    `<M:ask_user_choice id="${escapeActionAttr(params.id)}"`,
    `question="${escapeActionAttr(params.question)}"`,
    `option_1_id="${escapeActionAttr(params.option1Id)}"`,
    `option_1_label="${escapeActionAttr(params.option1Label)}"`,
    `option_1_reason="${escapeActionAttr(params.option1Reason)}"`,
    `option_2_id="${escapeActionAttr(params.option2Id)}"`,
    `option_2_label="${escapeActionAttr(params.option2Label)}"`,
    `option_2_reason="${escapeActionAttr(params.option2Reason)}"`,
    `default_option_id="${escapeActionAttr(params.defaultOptionId)}" />`,
  ]
  return parts.join(' ')
}

const estimateTotalChars = (params: {
  prompt: string
  title: string
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}): number =>
  [
    params.prompt,
    params.title,
    params.goal,
    params.scope,
    ...params.acceptance,
    ...(params.outOfScope ? [params.outOfScope] : []),
    ...(params.contextRefs ?? []),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .reduce((sum, item) => sum + item.length, 0)

const normalizeList = (items?: string[]): string[] =>
  (items ?? []).map((item) => item.trim()).filter((item) => item.length > 0)

const buildRunTaskConfirmationSeed = (params: {
  prompt: string
  title: string
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}): string =>
  [
    params.prompt.trim(),
    params.title.trim(),
    params.goal.trim(),
    params.scope.trim(),
    ...normalizeList(params.acceptance),
    params.outOfScope?.trim() ?? '',
    ...normalizeList(params.contextRefs),
  ].join('\n')

export const buildRunTaskConfirmationId = (params: {
  prompt: string
  title: string
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}): string => {
  const seed = buildRunTaskConfirmationSeed(params)
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 12)
  return `choice-confirm-${hash}`
}

export const resolveRunTaskConfirmationRequirement = (params: {
  prompt: string
  title: string
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}): {
  required: boolean
  choiceId: string
  estimatedChars: number
} => {
  const estimatedChars = estimateTotalChars(params)
  const promptChars = params.prompt.trim().length
  const acceptanceCount = params.acceptance.filter(
    (item) => item.trim().length > 0,
  ).length
  const required =
    promptChars >= HIGH_COST_PROMPT_CHARS ||
    estimatedChars >= HIGH_COST_TOTAL_CHARS ||
    (acceptanceCount >= HIGH_COST_ACCEPTANCE_COUNT && estimatedChars >= 1_600)
  return {
    required,
    choiceId: buildRunTaskConfirmationId({
      prompt: params.prompt,
      title: params.title,
      goal: params.goal,
      scope: params.scope,
      acceptance: params.acceptance,
      ...(params.outOfScope ? { outOfScope: params.outOfScope } : {}),
      ...(params.contextRefs ? { contextRefs: params.contextRefs } : {}),
    }),
    estimatedChars,
  }
}

const toStringField = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export const collectConfirmedRunTaskChoiceIds = (
  inputs: UserInput[],
): Set<string> => {
  const confirmed = new Set<string>()
  for (const input of inputs) {
    if (input.role !== 'system') continue
    const parsed = resolveSystemEvent(input)
    if (parsed.name !== 'user_choice') continue
    const choiceId = toStringField(parsed.payload?.choice_id)
    const selectedOptionId = toStringField(parsed.payload?.selected_option_id)
    if (!choiceId || selectedOptionId !== RUN_TASK_CONFIRM_OPTION_ID) continue
    confirmed.add(choiceId)
  }
  return confirmed
}

export const buildRunTaskConfirmationQuestion = (params: {
  title: string
  estimatedChars: number
}): string => {
  const title = normalizeText(params.title) || 'this task'
  return `Task "${title}" is high-cost (${params.estimatedChars} chars). Continue dispatch or narrow scope first?`
}

export const renderAskUserChoiceForRunTaskConfirmation = (params: {
  choiceId: string
  question: string
}): string =>
  buildAskUserChoiceActionText({
    id: params.choiceId,
    question: params.question,
    option1Id: RUN_TASK_CONFIRM_OPTION_ID,
    option1Label: 'Continue',
    option1Reason: 'Run current scope now',
    option2Id: RUN_TASK_CANCEL_OPTION_ID,
    option2Label: 'Cancel and narrow',
    option2Reason: 'Reduce scope before execution',
    defaultOptionId: RUN_TASK_CANCEL_OPTION_ID,
  })
