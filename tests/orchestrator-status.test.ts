import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { computeOrchestratorStatus } from '../src/orchestrator/core/orchestrator-helpers.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { Task } from '../src/types/index.js'

const createTask = (id: string, status: Task['status']): Task =>
  ({
    id,
    fingerprint: `fp-${id}`,
    prompt: 'test',
    title: 'test',
    profile: 'worker',
    status,
    createdAt: '2026-03-07T00:00:00.000Z',
  }) as Task

const createRuntime = (tasks: Task[]): RuntimeState =>
  ({
    runtimeId: 'runtime-status-test',
    config: defaultConfig({ workDir: '.mimikit' }),
    tasks,
    manager: { running: false },
    worker: { runningControllers: new Map() },
  }) as RuntimeState

test('pendingTasks excludes paused tasks for restart gating', () => {
  const runtime = createRuntime([
    createTask('task-paused-1', 'paused'),
    createTask('task-paused-2', 'paused'),
  ])

  const status = computeOrchestratorStatus(runtime, 0)

  expect(status.pendingTasks).toBe(0)
  expect(status.activeTasks).toBe(0)
  expect(status.managerRunning).toBe(false)
})
