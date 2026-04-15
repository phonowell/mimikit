import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPackets } from '../src/policy/prompts/manager-prompt-packet-build.js'
import { prepareManagerPromptRuntimeData } from '../src/policy/prompts/manager-prompt-runtime-data.js'
import { resolvePacketSectionPolicy } from '../src/policy/prompts/select-packet-sections.js'

const { readHistoryMock } = vi.hoisted(() => ({
  readHistoryMock: vi.fn(() => []),
}))

const { readMemoryEntriesMock } = vi.hoisted(() => ({
  readMemoryEntriesMock: vi.fn(() => []),
}))

vi.mock('../src/persistence/history/store.js', () => ({
  readHistory: readHistoryMock,
}))

vi.mock('../src/work/memory/store.js', () => ({
  readMemoryEntries: readMemoryEntriesMock,
}))

const parsePromptJson = (value: string): Record<string, unknown> =>
  JSON.parse(value) as Record<string, unknown>

test('state packet omits primary-only working_focuses details when multiple worklines are active', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-omit-working-focuses',
  })
  const sectionPolicy = resolvePacketSectionPolicy({
    mode: 'standard',
    wakeProfile: 'user_input',
  })
  const runtime = await prepareManagerPromptRuntimeData(
    {
      stateDir: config.workDir,
      workDir: config.workDir,
      inputs: [
        {
          id: 'input-1',
          role: 'user',
          text: 'keep both threads moving',
          focusId: 'focus-a',
          createdAt: '2026-03-20T00:00:01.000Z',
        },
      ],
      results: [],
      tasks: [],
      promptSectionLimits: config.manager.promptSections,
      focuses: [
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          summary: 'Primary detail',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:01.000Z',
          lastActivityAt: '2026-03-20T00:00:01.000Z',
        },
        {
          id: 'focus-b',
          title: 'Focus B',
          status: 'active',
          summary: 'Secondary thread',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        },
      ],
      workingFocusIds: ['focus-a', 'focus-b'],
      wakeProfile: 'user_input',
      packetMode: 'standard',
    },
    {
      includeTasks: sectionPolicy.tasks,
      includeInputs: sectionPolicy.inputs,
      includeProjectProfile: sectionPolicy.project_profile,
      includeRememberedMemory: sectionPolicy.remembered_memory,
      includeMemory: sectionPolicy.memory,
      includeWorkingFocuses: sectionPolicy.working_focuses,
      includeRecentHistory: sectionPolicy.recent_history,
    },
  )

  const packets = buildManagerPromptPackets({
    workDir: config.workDir,
    wakeProfile: 'user_input',
    packetMode: 'standard',
    limits: config.manager.promptSections,
    runtime,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'keep both threads moving',
        focusId: 'focus-a',
        createdAt: '2026-03-20T00:00:01.000Z',
      },
    ],
    tasks: [],
    plans: [],
    actionFeedback: [],
    workingFocusIds: ['focus-a', 'focus-b'],
    env: undefined,
    sectionPolicy,
  })

  const statePacket = parsePromptJson(packets.statePacket)

  expect(statePacket.working_focus_ids).toEqual(['focus-a', 'focus-b'])
  expect(statePacket).not.toHaveProperty('working_focuses')
})
