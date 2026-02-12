import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { Orchestrator } from '../src/orchestrator/core/orchestrator-service.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { Task, TaskStatus } from '../src/types/index.js'

const createTask = (id: string, status: TaskStatus): Task => ({
  id,
  fingerprint: `${id}-fingerprint`,
  prompt: 'prompt',
  title: 'title',
  profile: 'standard',
  status,
  createdAt: '2026-02-12T00:00:00.000Z',
})

const readRuntime = (orchestrator: Orchestrator): RuntimeState =>
  (orchestrator as unknown as { runtime: RuntimeState }).runtime

test('status activeTasks ignores canceled tasks even if controller exists', () => {
  const orchestrator = new Orchestrator(
    defaultConfig({
      workDir: '.mimikit-test-status',
    }),
  )
  const runtime = readRuntime(orchestrator)
  const runningTask = createTask('task-running', 'running')
  const canceledTask = createTask('task-canceled', 'canceled')
  runtime.tasks.push(runningTask, canceledTask)
  runtime.runningControllers.set(runningTask.id, new AbortController())
  runtime.runningControllers.set(canceledTask.id, new AbortController())

  const beforeDone = orchestrator.getStatus()
  expect(beforeDone.activeTasks).toBe(1)
  expect(beforeDone.agentStatus).toBe('running')

  runtime.runningControllers.delete(runningTask.id)
  const canceledOnly = orchestrator.getStatus()
  expect(canceledOnly.activeTasks).toBe(0)
  expect(canceledOnly.agentStatus).toBe('idle')
})
