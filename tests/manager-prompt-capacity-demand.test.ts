import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPayload } from '../src/policy/prompts/build-prompts.js'

const { readHistoryMock } = vi.hoisted(() => ({
  readHistoryMock: vi.fn(async () => []),
}))

const { readMemoryEntriesMock } = vi.hoisted(() => ({
  readMemoryEntriesMock: vi.fn(async () => []),
}))

vi.mock('../src/persistence/history/store.js', () => ({
  readHistory: readHistoryMock,
}))

vi.mock('../src/work/memory/store.js', () => ({
  readMemoryEntries: readMemoryEntriesMock,
}))

const buildCapacityPromptPayload = async (params: {
  workDir: string
  taskId: string
  prompt: string
  title: string
  packetMode: 'minimal' | 'expanded'
}) => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()
  const config = defaultConfig({
    workDir: params.workDir,
  })
  return buildManagerPromptPayload({
    stateDir: config.workDir,
    workDir: config.workDir,
    inputs: [],
    results: [],
    tasks: [
      {
        id: params.taskId,
        fingerprint: params.taskId,
        prompt: params.prompt,
        title: params.title,
        cwd: '/repo',
        focusId: 'focus-capacity',
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        createdAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    promptSectionLimits: config.manager.promptSections,
    focuses: [
      {
        id: 'focus-capacity',
        title: 'Capacity retry',
        status: 'active',
        summary: 'Retry queued work when slots free up.',
        openItems: ['Resume pending task'],
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
        lastActivityAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    workingFocusIds: ['focus-capacity'],
    wakeProfile: 'capacity',
    packetMode: params.packetMode,
  })
}

test('buildManagerPromptPayload keeps working focus history for minimal capacity packets', async () => {
  const payload = await buildCapacityPromptPayload({
    workDir: '/tmp/mimikit-context-demand-capacity',
    taskId: 'task-capacity-1',
    prompt: 'resume queued work',
    title: 'Resume queued work',
    packetMode: 'minimal',
  })

  expect(readHistoryMock).toHaveBeenCalledTimes(1)
  expect(readMemoryEntriesMock).toHaveBeenCalledTimes(1)
  expect(payload.contextPacket.includedSections).toContain('working_focuses')
  expect(payload.contextPacket.prunedSections).not.toContain('working_focuses')
})

test('buildManagerPromptPayload keeps working focus context for expanded capacity packets', async () => {
  const payload = await buildCapacityPromptPayload({
    workDir: '/tmp/mimikit-context-demand-capacity-expanded',
    taskId: 'task-capacity-2',
    prompt: 'resume queued work with follow-up',
    title: 'Resume queued work with follow-up',
    packetMode: 'expanded',
  })

  expect(readHistoryMock).toHaveBeenCalledTimes(1)
  expect(readMemoryEntriesMock).toHaveBeenCalledTimes(1)
  expect(payload.contextPacket.includedSections).toContain('working_focuses')
})
