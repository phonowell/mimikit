import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import { applyAskUserChoiceAction } from './action-apply-choice.js'
import {
  buildRunTaskConfirmationQuestion,
  collectConfirmedRunTaskChoiceIds,
  resolveRunTaskConfirmationRequirement,
  RUN_TASK_CANCEL_OPTION_ID,
  RUN_TASK_CONFIRM_OPTION_ID,
} from './run-task-confirmation.js'

import type { TaskContract } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const requestRunTaskConfirmation = async (params: {
  runtime: ManagerRuntime
  choiceId: string
  estimatedChars: number
  title: string
  focusId: string
}): Promise<void> => {
  const question = buildRunTaskConfirmationQuestion({
    title: params.title,
    estimatedChars: params.estimatedChars,
  })
  await applyAskUserChoiceAction(params.runtime, {
    name: 'ask_user_choice',
    attrs: {
      id: params.choiceId,
      question,
      option_1_id: RUN_TASK_CONFIRM_OPTION_ID,
      option_1_label: 'Continue',
      option_1_reason: 'Run current scope now',
      option_2_id: RUN_TASK_CANCEL_OPTION_ID,
      option_2_label: 'Cancel and narrow',
      option_2_reason: 'Reduce scope before execution',
      default_option_id: RUN_TASK_CANCEL_OPTION_ID,
    },
  })
  await bestEffort('appendLog: run_task_confirmation_required', () =>
    appendLog(params.runtime.paths.log, {
      event: 'run_task_confirmation_required',
      choiceId: params.choiceId,
      estimatedChars: params.estimatedChars,
      taskTitle: params.title,
      focusId: params.focusId,
    }),
  )
}

export const ensureRunTaskConfirmation = async (params: {
  runtime: ManagerRuntime
  prompt: string
  title: string
  focusId: string
  contract: TaskContract
}): Promise<'continue' | 'stop'> => {
  const confirmation = resolveRunTaskConfirmationRequirement({
    prompt: params.prompt,
    title: params.title,
    goal: params.contract.goal,
    scope: params.contract.scope,
    acceptance: params.contract.acceptance,
    ...(params.contract.outOfScope
      ? { outOfScope: params.contract.outOfScope }
      : {}),
    ...(params.contract.contextRefs
      ? { contextRefs: params.contract.contextRefs }
      : {}),
  })
  const confirmedRunTaskChoiceIds = collectConfirmedRunTaskChoiceIds(
    params.runtime.session.inflightInputs,
  )
  if (
    !confirmation.required ||
    confirmedRunTaskChoiceIds.has(confirmation.choiceId)
  )
    return 'continue'
  await requestRunTaskConfirmation({
    runtime: params.runtime,
    choiceId: confirmation.choiceId,
    estimatedChars: confirmation.estimatedChars,
    title: params.title,
    focusId: params.focusId,
  })
  return 'stop'
}
