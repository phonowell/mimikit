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
    cwd: '/tmp/orchestrator-status',
    profile: 'worker',
    provider: 'codex',
    status,
    createdAt: '2026-03-07T00:00:00.000Z',
  }) as Task

const createRuntime = (tasks: Task[]): RuntimeState =>
  ({
    runtimeId: 'runtime-status-test',
    config: defaultConfig({ workDir: '.mimikit' }),
    tasks,
    manager: { running: false },
    worker: { runningControllers: new Map(), runningTaskLocks: new Set() },
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

test('status exposes manager packet and usage totals when present', () => {
  const runtime = createRuntime([
    {
      ...createTask('task-usage-1', 'succeeded'),
      usage: { input: 10, output: 2, total: 12 },
    },
  ])
  runtime.manager = {
    ...(runtime.manager as RuntimeState['manager']),
    running: false,
    lastContextPacket: {
      id: 'packet-status-1',
      createdAt: '2026-03-10T00:00:00.000Z',
      wakeProfile: 'user_input',
      mode: 'standard',
      counts: {
        inputs: 1,
        results: 0,
        tasks: 1,
        plans: 0,
        workingFocuses: 1,
      },
      includedSections: ['packet_summary', 'inputs'],
      prunedSections: ['history_lookup'],
    },
    lastUsage: { input: 20, output: 5, total: 25 },
    usageTotal: { input: 30, output: 7, total: 37 },
  } as RuntimeState['manager']

  const status = computeOrchestratorStatus(runtime, 1)

  expect(status.managerLastContextPacket?.id).toBe('packet-status-1')
  expect(status.managerUsageTotal).toEqual({ input: 30, output: 7, total: 37 })
  expect(status.workerUsageTotal).toEqual({ input: 10, output: 2, total: 12 })
})
