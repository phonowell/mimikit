import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../../src/work/orchestrator/task-state.js'
import { persistTaskExecutionSpec } from '../../src/work/spec/store.js'

import type {
  Task,
  TaskContract,
  TaskPlan,
} from '../../src/foundation/types/index.js'

type LegacyTask = Partial<Task> & {
  id: string
  prompt?: string
  contract?: TaskContract
}

type LegacyEnqueueTaskTemplate = {
  prompt?: string
  title?: string
  cwd?: string
  resourceMode?: Task['resourceMode']
  branch?: string
  executionSpecId?: string
  fingerprint?: string
  contract?: TaskContract
}

type LegacyPlan = Partial<TaskPlan> & {
  id: string
  title: string
  focusId: TaskPlan['focusId']
  effect?: Partial<Extract<TaskPlan['effect'], { kind: 'enqueue_task' }>>
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
  const {
    branch,
    contract,
    cwd: taskCwd,
    executionSpecId,
    fingerprint: taskFingerprint,
    focusId: taskFocusId,
    profile: taskProfile,
    provider: taskProvider,
    prompt: taskPrompt,
    repoKey,
    resourceMode,
    semanticKey: taskSemanticKey,
    title: taskTitle,
  } = task
  const title = taskTitle?.trim() ?? taskPrompt?.trim() ?? task.id
  const cwd = taskCwd?.trim() ?? '/tmp/test-task'
  const focusId = taskFocusId?.trim() ?? 'focus-global'
  const profile = task.profile ?? 'worker'
  const provider = task.provider ?? 'codex'
  const prompt = taskPrompt?.trim() ?? title
  const specId = executionSpecId?.trim() ?? `spec-${task.id}`
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
      taskFingerprint ??
      buildTaskFingerprint({
        prompt,
        title,
        cwd,
        ...(resourceMode ? { resourceMode } : {}),
        profile,
        provider,
        focusId,
        ...(repoKey ? { repoKey } : {}),
        ...(branch ? { branch } : {}),
        ...(contract ? { contract } : {}),
      }),
    semanticKey:
      taskSemanticKey ??
      buildTaskSemanticKey({
        prompt,
        title,
        cwd,
        ...(resourceMode ? { resourceMode } : {}),
        profile,
        provider,
        focusId,
        ...(repoKey ? { repoKey } : {}),
        ...(branch ? { branch } : {}),
        ...(contract ? { contract } : {}),
      }),
    executionSpecId: spec.id,
    title,
    cwd,
    ...(resourceMode ? { resourceMode } : {}),
    focusId,
    profile: taskProfile ?? 'worker',
    provider: taskProvider ?? 'codex',
    status: task.status ?? 'pending',
    createdAt: task.createdAt ?? '2026-02-01T00:00:00.000Z',
  }

  delete task.prompt
  delete task.contract
  return materialized
}

export const materializePlanFixture = async (params: {
  stateDir: string
  plan: LegacyPlan
}): Promise<TaskPlan> => {
  const { effect } = params.plan
  if (!effect?.taskTemplate) return params.plan as TaskPlan

  const template = effect.taskTemplate as LegacyEnqueueTaskTemplate
  const contract = effect.taskContract ?? template.contract
  const title = template.title?.trim() ?? params.plan.title.trim()
  const cwd = template.cwd?.trim() ?? '/tmp/test-plan-task'
  const prompt = template.prompt?.trim() ?? title
  const specId = template.executionSpecId?.trim() ?? `spec-${params.plan.id}`
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
      taskKey:
        (effect.taskKey as string | undefined) ??
        template.fingerprint ??
        buildTaskFingerprint({
          prompt,
          title,
          cwd,
          ...(template.resourceMode
            ? { resourceMode: template.resourceMode }
            : {}),
          profile: 'worker',
          provider: 'codex',
          focusId: params.plan.focusId,
          ...(template.branch ? { branch: template.branch } : {}),
          ...(contract ? { contract } : {}),
        }),
      ...(contract ? { taskContract: contract } : {}),
      taskTemplate: {
        title,
        cwd,
        executionSpecId: spec.id,
        ...(template.resourceMode
          ? { resourceMode: template.resourceMode }
          : {}),
        ...(template.branch ? { branch: template.branch } : {}),
      },
    },
  }

  delete template.prompt
  return materialized
}
