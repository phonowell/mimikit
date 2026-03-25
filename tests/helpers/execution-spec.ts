import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../../src/work/orchestrator/task-state.js'
import { persistTaskExecutionSpec } from '../../src/work/spec/store.js'

import type { Task, TaskContract, TaskPlan } from '../../src/foundation/types/index.js'

type LegacyTask = Partial<Task> & {
  id: string
  prompt?: string
  contract?: TaskContract
}

type LegacyEnqueueTaskTemplate = {
  prompt?: string
  contract?: TaskContract
  title?: string
  cwd?: string
  branch?: string
  executionSpecId?: string
  fingerprint?: string
  semanticKey?: string
}

const stripLegacyTask = (
  task: LegacyTask,
): Omit<LegacyTask, 'prompt' | 'contract'> => {
  const { prompt: _prompt, contract: _contract, ...rest } = task
  return rest
}

export const materializeTaskFixture = async (params: {
  stateDir: string
  task: LegacyTask
}): Promise<Task> => {
  const { task } = params
  const contract = task.contract
  const title = task.title?.trim() || task.prompt?.trim() || task.id
  const cwd = task.cwd?.trim() || '/tmp/test-task'
  const focusId = task.focusId?.trim() || 'focus-global'
  const profile = task.profile ?? 'worker'
  const provider = task.provider ?? 'codex'
  const prompt = task.prompt?.trim() || title
  const specId = task.executionSpecId?.trim() || `spec-${task.id}`
  const spec = await persistTaskExecutionSpec({
    stateDir: params.stateDir,
    prompt,
    ...(contract ? { contract } : {}),
    specId,
  })

  const materialized: Task = {
    ...stripLegacyTask(task),
    id: task.id,
    fingerprint:
      task.fingerprint ||
      buildTaskFingerprint({
        prompt,
        title,
        cwd,
        profile,
        provider,
        focusId,
        ...(task.repoKey ? { repoKey: task.repoKey } : {}),
        ...(task.branch ? { branch: task.branch } : {}),
        ...(contract ? { contract } : {}),
      }),
    semanticKey:
      task.semanticKey ||
      buildTaskSemanticKey({
        prompt,
        title,
        cwd,
        profile,
        provider,
        focusId,
        ...(task.repoKey ? { repoKey: task.repoKey } : {}),
        ...(task.branch ? { branch: task.branch } : {}),
        ...(contract ? { contract } : {}),
      }),
    executionSpecId: spec.id,
    title,
    cwd,
    focusId,
    profile,
    provider,
    status: task.status ?? 'pending',
    createdAt: task.createdAt ?? '2026-02-01T00:00:00.000Z',
  }

  delete task.prompt
  delete task.contract
  return materialized
}

export const materializePlanFixture = async (params: {
  stateDir: string
  plan: TaskPlan
}): Promise<TaskPlan> => {
  const effect = params.plan.effect
  if (!effect || effect.kind !== 'enqueue_task') return params.plan

  const template = effect.taskTemplate as LegacyEnqueueTaskTemplate
  const contract = template.contract
  const title = template.title?.trim() || params.plan.title.trim() || params.plan.id
  const cwd = template.cwd?.trim() || '/tmp/test-plan-task'
  const prompt = template.prompt?.trim() || title
  const specId = template.executionSpecId?.trim() || `spec-${params.plan.id}`
  const spec = await persistTaskExecutionSpec({
    stateDir: params.stateDir,
    prompt,
    ...(contract ? { contract } : {}),
    specId,
  })

  const materialized: TaskPlan = {
    ...params.plan,
    effect: {
      kind: 'enqueue_task',
      taskTemplate: {
        title,
        cwd,
        executionSpecId: spec.id,
        fingerprint:
          template.fingerprint ||
          buildTaskFingerprint({
            prompt,
            title,
            cwd,
            profile: 'worker',
            provider: 'codex',
            focusId: params.plan.focusId,
            ...(template.branch ? { branch: template.branch } : {}),
            ...(contract ? { contract } : {}),
          }),
        semanticKey:
          template.semanticKey ||
          buildTaskSemanticKey({
            prompt,
            title,
            cwd,
            profile: 'worker',
            provider: 'codex',
            focusId: params.plan.focusId,
            ...(template.branch ? { branch: template.branch } : {}),
            ...(contract ? { contract } : {}),
          }),
        ...(template.branch ? { branch: template.branch } : {}),
      },
    },
  }

  delete template.prompt
  delete template.contract
  return materialized
}
