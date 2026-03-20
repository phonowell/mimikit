import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'

const { readHistoryMock } = vi.hoisted(() => ({
  readHistoryMock: vi.fn(async () => []),
}))

const { readMemoryEntriesMock } = vi.hoisted(() => ({
  readMemoryEntriesMock: vi.fn(async () => []),
}))

const { readTaskResultsForTasksMock } = vi.hoisted(() => ({
  readTaskResultsForTasksMock: vi.fn(async () => []),
}))

vi.mock('../src/history/store.js', () => ({
  readHistory: readHistoryMock,
}))

vi.mock('../src/memory/store.js', () => ({
  readMemoryEntries: readMemoryEntriesMock,
}))

vi.mock('../src/storage/task-results.js', async () => {
  const actual = await vi.importActual('../src/storage/task-results.js')
  return {
    ...actual,
    readTaskResultsForTasks: readTaskResultsForTasksMock,
  }
})

test('buildManagerPromptPayload skips history reads for minimal task_result packets without focus context', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()
  readTaskResultsForTasksMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-minimal',
  })

  await buildManagerPromptPayload({
    stateDir: config.workDir,
    workDir: config.workDir,
    inputs: [],
    results: [
      {
        taskId: 'task-1',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: 1,
        completedAt: '2026-03-20T00:00:01.000Z',
      },
    ],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
    wakeProfile: 'task_result',
    packetMode: 'minimal',
  })

  expect(readHistoryMock).not.toHaveBeenCalled()
  expect(readMemoryEntriesMock).toHaveBeenCalledTimes(1)
  expect(readTaskResultsForTasksMock).not.toHaveBeenCalled()
})

test('buildManagerPromptPayload reads history and memory when standard packet sections require them', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()
  readTaskResultsForTasksMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-standard',
  })

  await buildManagerPromptPayload({
    stateDir: config.workDir,
    workDir: config.workDir,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'continue',
        quote: 'msg-1',
        focusId: 'focus-global',
        createdAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
    focuses: [
      {
        id: 'focus-global',
        title: 'Global',
        status: 'active',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
        lastActivityAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    workingFocusIds: ['focus-global'],
    wakeProfile: 'user_input',
    packetMode: 'standard',
  })

  expect(readHistoryMock).toHaveBeenCalledTimes(1)
  expect(readMemoryEntriesMock).toHaveBeenCalledTimes(1)
  expect(readTaskResultsForTasksMock).not.toHaveBeenCalled()
})
