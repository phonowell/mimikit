import { buildTaskFingerprint } from '../../work/orchestrator/task-state.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'
import { persistTaskExecutionSpec } from '../../work/spec/store.js'

import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { ManagerTaskDraft } from './manager-turn-schema.js'
import type {
  TaskPlanEffect,
  TaskResourceMode,
} from '../../foundation/types/index.js'

export const buildPlanEnqueueTaskEffect = async (params: {
  stateDir: string
  focusId: string
  task: ManagerTaskDraft
}): Promise<TaskPlanEffect> => {
  const contract = buildTaskContractFromDraft(params.task)
  const prompt = resolveWorkerPromptFromDraft(params.task, {
    stateDir: params.stateDir,
  })
  if (!contract || !prompt)
    throw new Error('invalid_plan_effect: enqueue_task contract missing')

  const resourceMode = resolveTaskResourceMode(
    params.task.mode as TaskResourceMode,
  )
  const spec = await persistTaskExecutionSpec({
    stateDir: params.stateDir,
    prompt,
    contract,
  })
  const taskKey = buildTaskFingerprint({
    prompt,
    title: params.task.title,
    cwd: params.task.cwd,
    resourceMode,
    profile: 'worker',
    provider: 'codex',
    focusId: params.focusId,
    ...(params.task.use_worktree ? { useWorktree: true } : {}),
    contract,
  })
  return {
    kind: 'enqueue_task',
    taskKey,
    taskContract: contract,
    taskTemplate: {
      title: params.task.title,
      executionSpecId: spec.id,
      cwd: params.task.cwd,
      resourceMode,
      ...(params.task.use_worktree ? { useWorktree: true } : {}),
    },
  }
}
