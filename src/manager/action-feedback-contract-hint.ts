import { formatEnqueueTaskContractMissingHint } from './action-feedback-hints.js'
import { TASK_CONTRACT_REQUIRED_HINT } from './task-contract.js'

import type { Parsed } from '../actions/model/spec.js'

export const isTaskContractMissingHint = (hint: string): boolean =>
  hint.includes(TASK_CONTRACT_REQUIRED_HINT)

export const buildTaskContractMissingHintFromAction = (
  item: Parsed,
): string | undefined => {
  if (item.name !== 'enqueue_task') return undefined
  return formatEnqueueTaskContractMissingHint({
    prompt: item.attrs.prompt,
    title: item.attrs.title,
    goal: item.attrs.goal,
    scope: item.attrs.scope,
    acceptance_1: item.attrs.acceptance_1,
  })
}
