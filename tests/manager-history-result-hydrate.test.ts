import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { appendTaskResultArchive } from '../src/persistence/storage/task-results.js'
import { buildManagerPromptPayload } from '../src/policy/prompts/build-prompts.js'
import { hydratePromptHistoryResults } from '../src/policy/prompts/manager-prompt-history-hydrate.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { TaskResult } from '../src/foundation/types/index.js'

const { readHistoryMock } = vi.hoisted(() => ({
  readHistoryMock: vi.fn(() => Promise.resolve([])),
}))
const { readMemoryEntriesMock } = vi.hoisted(() => ({
  readMemoryEntriesMock: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../src/persistence/history/store.js', () => ({
  readHistory: readHistoryMock,
}))
vi.mock('../src/work/memory/entry-codec.js', () => ({
  readMemoryEntries: readMemoryEntriesMock,
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-history-hydrate-'))
const ARCHIVE_OUTPUT = 'Recovered result body with explicit evidence lines.'
const input = (text: string, focusId = 'focus-global') => ({
  id: 'input-1',
  role: 'user' as const,
  text,
  focusId,
  createdAt: '2026-04-01T00:06:00.000Z',
})
const taskCard = (taskId: string, archivePath: string) =>
  createTaskFixture({
    id: taskId,
    title: 'Hydrate archived result',
    status: 'succeeded',
    completedAt: '2026-04-01T00:05:00.000Z',
    archivePath,
  })

const appendSucceededArchive = (stateDir: string, taskId: string) =>
  appendTaskResultArchive(stateDir, {
    taskId,
    title: 'Hydrate archived result',
    status: 'succeeded',
    provider: 'codex',
    prompt: 'Prompt',
    output: ARCHIVE_OUTPUT,
    createdAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-04-01T00:05:00.000Z',
    durationMs: 500,
    handoff: {
      summary: 'Recovered archive summary for manager replay.',
      evidence: [
        {
          type: 'task_archive',
          ref: `/archive/${taskId}.md`,
        },
      ],
    },
    evidence: {
      status: 'done',
      contractGoal: 'Replay archived task result',
      acceptanceChecks: [{ criterion: 'archive exists', met: true }],
      stateDelta: {
        taskStatusTo: 'succeeded',
      },
    },
  })

test('hydratePromptHistoryResults returns succeeded archive when latest user input names task id', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-hydrate-1'
  const archivePath = await appendSucceededArchive(stateDir, taskId)
  const task = taskCard(taskId, archivePath)
  task.result = {
    taskId,
    status: 'succeeded',
    ok: true,
    output: 'Stable summary only.',
    durationMs: 500,
    completedAt: '2026-04-01T00:05:00.000Z',
    archivePath,
  }

  const hydrated = await hydratePromptHistoryResults({
    stateDir,
    workDir: stateDir,
    inputs: [input(`请回读 ${taskId} 的完整结果`, task.focusId)],
    results: [],
    tasks: [task],
  })

  expect(hydrated.hydratedTaskIds).toEqual([taskId])
  expect(hydrated.results[0]).toMatchObject({
    taskId,
    output: ARCHIVE_OUTPUT,
    archivePath,
  })
})

test('hydratePromptHistoryResults accepts explicit archive path without task card', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-hydrate-2'
  const archivePath = await appendSucceededArchive(stateDir, taskId)

  const hydrated = await hydratePromptHistoryResults({
    stateDir,
    workDir: stateDir,
    inputs: [input(`请基于 ${archivePath} 汇报结果`)],
    results: [],
    tasks: [],
  })

  expect(hydrated.hydratedTaskIds).toEqual([taskId])
  expect(hydrated.results[0]).toMatchObject({
    taskId,
    archivePath,
  })
})

test('hydratePromptHistoryResults skips archive replay when current batch already has the task result', async () => {
  const stateDir = await createTmpDir()
  const taskId = 'task-hydrate-3'
  const archivePath = await appendSucceededArchive(stateDir, taskId)
  const currentResult: TaskResult = {
    taskId,
    status: 'succeeded',
    ok: true,
    output: 'Current batch result already available.',
    durationMs: 10,
    completedAt: '2026-04-01T00:06:00.000Z',
    archivePath,
  }

  const hydrated = await hydratePromptHistoryResults({
    stateDir,
    workDir: stateDir,
    inputs: [input(`再说一下 ${taskId} 的结果`)],
    results: [currentResult],
    tasks: [taskCard(taskId, archivePath)],
  })

  expect(hydrated.hydratedTaskIds).toEqual([])
  expect(hydrated.results).toEqual([])
})

test('buildManagerPromptPayload exposes hydrated archive body through batch_results when task id is explicit', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const stateDir = await createTmpDir()
  const taskId = 'task-hydrate-4'
  const archivePath = await appendSucceededArchive(stateDir, taskId)
  const config = defaultConfig({ workDir: stateDir })

  const payload = await buildManagerPromptPayload({
    stateDir,
    workDir: stateDir,
    inputs: [input(`请直接根据 ${taskId} 做验收汇报`)],
    results: [],
    tasks: [taskCard(taskId, archivePath)],
    promptSectionLimits: config.manager.promptSections,
    wakeProfile: 'user_input',
    packetMode: 'standard',
  })

  expect(payload.contextPacket.latestResult).toMatchObject({
    taskId,
    status: 'succeeded',
  })
  expect(payload.prompt).toContain(ARCHIVE_OUTPUT)
  expect(payload.prompt).toContain(
    'Recovered archive summary for manager replay.',
  )
})
