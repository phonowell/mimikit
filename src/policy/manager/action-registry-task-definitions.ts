import { cancelTask } from '../../execution/worker/cancel-task.js'
import { pauseTask } from '../../execution/worker/pause-task.js'
import { recordTaskGitLifecycle } from '../../execution/worker/record-task-git-lifecycle.js'
import { resumeTask } from '../../execution/worker/resume-task.js'

import { applyRunTask } from './action-apply-create.js'
import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import {
  mutateTaskSchema,
  restartRuntimeSchema,
} from './action-apply-schema.js'
import {
  formatRestartRuntimeAlreadyScheduledHint,
  formatRestartRuntimeBusyHint,
  formatRestartRuntimeUnavailableHint,
} from './action-feedback-hints.js'
import { parseActionAttrs } from './action-parse.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import {
  createContinueAction,
  createNoopAction,
  createStopAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  validateMutateTask,
  validateRestartRuntime,
  validateRunTask,
  validateSummarizeTaskResult,
} from './action-validation.js'
import { scheduleManagerRestart } from './restart-runtime.js'

import type { Parsed } from '../actions/model/spec.js'

const applyMutateTaskAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, mutateTaskSchema)
  if (!parsed) return
  const { id, op, reason, sha, resume_instruction: resumeInstruction } = parsed
  const meta = {
    source: 'deferred',
    ...(reason ? { reason } : {}),
    ...(sha ? { sha } : {}),
    ...(resumeInstruction ? { resumeInstruction } : {}),
  }
  if (op === 'pause') {
    await pauseTask(runtime, id, meta)
    return
  }
  if (op === 'resume') {
    await resumeTask(runtime, id, meta)
    return
  }
  if (op === 'review_passed' || op === 'merged' || op === 'cleaned') {
    await recordTaskGitLifecycle(runtime, id, op, meta)
    return
  }
  await cancelTask(runtime, id, meta)
}

const applyRestartRuntimeAction = (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, restartRuntimeSchema)
  if (!parsed) return Promise.resolve()
  const result = scheduleManagerRestart(runtime, parsed.reason)
  if (result === 'scheduled') return Promise.resolve()
  const hint =
    result === 'busy'
      ? formatRestartRuntimeBusyHint()
      : result === 'already_scheduled'
        ? formatRestartRuntimeAlreadyScheduledHint()
        : formatRestartRuntimeUnavailableHint()
  throw new ActionApplyFeedbackError({
    action: 'restart_runtime',
    error: 'action_execution_rejected',
    hint,
  })
}

export const TASK_ACTION_DEFINITIONS = [
  {
    name: 'enqueue_task',
    domain: 'task',
    prompt: ACTION_PROMPT_SPECS.enqueue_task,
    validate: (item, context) => validateRunTask(item, context),
    apply: (runtime, item, context) =>
      applyRunTask(runtime, item, context.seen, context.options),
  } satisfies ManagerActionDefinition,
  createContinueAction(
    {
      name: 'mutate_task',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.mutate_task,
    },
    (item, context) => validateMutateTask(item, context),
    applyMutateTaskAction,
  ),
  createStopAction(
    {
      name: 'restart_runtime',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.restart_runtime,
    },
    (item, context) => validateRestartRuntime(item, context),
    applyRestartRuntimeAction,
  ),
  createNoopAction(
    {
      name: 'set_task_result_summary',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.set_task_result_summary,
    },
    (item, context) => validateSummarizeTaskResult(item, context),
  ),
] satisfies ManagerActionDefinition[]
