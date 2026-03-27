import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../../work/orchestrator/task-state.js'
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
  const prompt = resolveWorkerPromptFromDraft(params.task)
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
  const fingerprint = buildTaskFingerprint({
    prompt,
    title: params.task.title,
    cwd: params.task.cwd,
    resourceMode,
    profile: 'worker',
    provider: 'codex',
    focusId: params.focusId,
    contract,
  })
  const semanticKey = buildTaskSemanticKey({
    prompt,
    title: params.task.title,
    cwd: params.task.cwd,
    resourceMode,
    profile: 'worker',
    provider: 'codex',
    focusId: params.focusId,
    contract,
  })
  return {
    kind: 'enqueue_task',
    taskTemplate: {
      title: params.task.title,
      executionSpecId: spec.id,
      fingerprint,
      semanticKey,
      cwd: params.task.cwd,
      resourceMode,
    },
  }
}
