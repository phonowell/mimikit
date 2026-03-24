import { formatEnqueueTaskContractMissingHint } from './action-feedback-hints.js'
import { TASK_CONTRACT_REQUIRED_HINT } from './task-contract.js'

export const isTaskContractMissingHint = (hint: string): boolean =>
  hint.includes(TASK_CONTRACT_REQUIRED_HINT)

export const buildTaskContractMissingHintFromAction = (params: {
  name: string
  attrs: Record<string, string>
}): string | undefined => {
  if (params.name !== 'enqueue_task') return undefined
  return formatEnqueueTaskContractMissingHint({
    worker_prompt: params.attrs.worker_prompt,
    title: params.attrs.title,
    cwd: params.attrs.cwd,
    goal: params.attrs.goal,
    in_scope: params.attrs.in_scope,
    out_of_scope: params.attrs.out_of_scope,
    done_when_1: params.attrs.done_when_1,
  })
}
