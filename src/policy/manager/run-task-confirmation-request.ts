import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import { applyAskUserChoiceAction } from './action-apply-choice.js'
import {
  buildRunTaskConfirmationQuestion,
  RUN_TASK_CANCEL_OPTION_ID,
  RUN_TASK_CONFIRM_OPTION_ID,
} from './run-task-confirmation.js'

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
