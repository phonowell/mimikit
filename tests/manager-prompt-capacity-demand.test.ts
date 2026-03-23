import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'

const { readHistoryMock } = vi.hoisted(() => ({
  readHistoryMock: vi.fn(async () => []),
}))

const { readMemoryEntriesMock } = vi.hoisted(() => ({
  readMemoryEntriesMock: vi.fn(async () => []),
}))

vi.mock('../src/history/store.js', () => ({
  readHistory: readHistoryMock,
}))

vi.mock('../src/memory/store.js', () => ({
  readMemoryEntries: readMemoryEntriesMock,
}))

test('buildManagerPromptPayload skips working focus history for minimal capacity packets', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-capacity',
  })

  const payload = await buildManagerPromptPayload({
    stateDir: config.workDir,
    workDir: config.workDir,
    inputs: [],
    results: [],
    tasks: [
      {
        id: 'task-capacity-1',
        fingerprint: 'task-capacity-1',
        prompt: 'resume queued work',
        title: 'Resume queued work',
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
    packetMode: 'minimal',
  })

  expect(readHistoryMock).not.toHaveBeenCalled()
  expect(readMemoryEntriesMock).toHaveBeenCalledTimes(1)
  expect(payload.contextPacket.includedSections).not.toContain('working_focuses')
  expect(payload.contextPacket.prunedSections).not.toContain('working_focuses')
})

test('buildManagerPromptPayload keeps working focus context for expanded capacity packets', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-capacity-expanded',
  })

  const payload = await buildManagerPromptPayload({
    stateDir: config.workDir,
    workDir: config.workDir,
    inputs: [],
    results: [],
    tasks: [
      {
        id: 'task-capacity-2',
        fingerprint: 'task-capacity-2',
        prompt: 'resume queued work with follow-up',
        title: 'Resume queued work with follow-up',
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
    packetMode: 'expanded',
  })

  expect(readHistoryMock).toHaveBeenCalledTimes(1)
  expect(readMemoryEntriesMock).toHaveBeenCalledTimes(1)
  expect(payload.contextPacket.includedSections).toContain('working_focuses')
})
