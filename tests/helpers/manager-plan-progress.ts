import { createTestRuntimeState } from './runtime-state.js'

import type {
  TaskPlan,
  TaskPlanTrigger,
} from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

const DEFAULT_TIMESTAMP = '2026-02-13T00:00:00.000Z'

export const createPlanProgressRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

export const buildScheduledTask = (cwd: string) => ({
  title: 'scheduled title',
  cwd,
  mode: 'write' as const,
  goal: 'Deliver requested outcome',
  in_scope: ['Single runnable worker task'],
  out_of_scope: [],
  done_when: ['Return concrete output'],
  context_refs: [],
  instructions: ['deliver scheduled work'],
})

export const createTriggeredEnqueuePlan = (params: {
  id: string
  title: string
  cwd: string
  focusId?: string
  taskKey?: string
  executionSpecId?: string
  taskTemplateTitle?: string
  resourceMode?: 'read' | 'write'
  trigger?: TaskPlanTrigger
  createdAt?: string
  updatedAt?: string
  runtime?: TaskPlan['runtime']
  taskContract?: TaskPlan['effect']['taskContract']
}): TaskPlan => {
  const createdAt = params.createdAt ?? DEFAULT_TIMESTAMP
  const updatedAt = params.updatedAt ?? createdAt
  return {
    id: params.id,
    title: params.title,
    focusId: params.focusId ?? 'focus-inbox',
    priority: 'normal',
    status: 'active',
    trigger: params.trigger ?? {
      mode: 'scheduled_at',
      scheduledAt: createdAt,
    },
    effect: {
      kind: 'enqueue_task',
      taskKey: params.taskKey ?? `task-key-${params.id}`,
      ...(params.taskContract ? { taskContract: params.taskContract } : {}),
      taskTemplate: {
        title: params.taskTemplateTitle ?? params.title,
        executionSpecId: params.executionSpecId ?? `spec-${params.id}`,
        cwd: params.cwd,
        resourceMode: params.resourceMode ?? 'write',
      },
    },
    createdAt,
    updatedAt,
    runtime: params.runtime ?? { runCount: 1 },
  }
}
