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
    worker_prompt: item.attrs.worker_prompt,
    title: item.attrs.title,
    cwd: item.attrs.cwd,
    goal: item.attrs.goal,
    in_scope: item.attrs.in_scope,
    out_of_scope: item.attrs.out_of_scope,
    done_when_1: item.attrs.done_when_1,
  })
}
