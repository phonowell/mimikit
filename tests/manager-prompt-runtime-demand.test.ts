import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPayload } from '../src/policy/prompts/build-prompts.js'
import { buildManagerPromptPackets } from '../src/policy/prompts/manager-prompt-packet-build.js'
import { prepareManagerPromptRuntimeData } from '../src/policy/prompts/manager-prompt-runtime-data.js'
import { buildMemoryPromptScoreContext } from '../src/policy/prompts/manager-prompt-runtime-helpers.js'
import { resolvePacketSectionPolicy } from '../src/policy/prompts/select-packet-sections.js'

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

const parsePromptJson = (value: string): Record<string, unknown> =>
  JSON.parse(value) as Record<string, unknown>

test('buildManagerPromptPayload skips history reads for minimal task_result packets without focus context', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

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
})

test('buildManagerPromptPayload reads history and memory when standard packet sections require them', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

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
})

test('buildMemoryPromptScoreContext excludes task outputs and plan titles from memory ranking context', () => {
  const context = buildMemoryPromptScoreContext({
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'Keep replies concise.',
        focusId: 'focus-a',
        createdAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        fingerprint: 'task-1',
        prompt: 'old prompt',
        title: 'Consolidate manager prompt',
        cwd: '/repo',
        focusId: 'focus-a',
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        createdAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    focusPayload: {
      focusList: [
        {
          id: 'focus-a',
          title: 'Prompt alignment',
          status: 'active',
          isActive: true,
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        },
      ],
      workingFocuses: [
        {
          focusId: 'focus-a',
          title: 'Prompt alignment',
          status: 'active',
          summary: 'Keep manager context compact.',
          openItems: ['Preserve only orchestration state'],
          recentMessages: [],
        },
      ],
      recentHistory: [],
    },
    workingFocusIds: ['focus-a'],
  })

  expect(context.queryText).toContain('Keep replies concise.')
  expect(context.queryText).toContain('Consolidate manager prompt')
  expect(context.queryText).not.toContain('Temporary rollout checklist')
  expect(context.queryText).not.toContain('Nightly backlog sweep')
  expect(context.mentionTexts).not.toContain('Temporary rollout checklist')
})

test('buildManagerPromptPayload surfaces ordered working focus ids in state context', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-multi-focus',
  })

  const payload = await buildManagerPromptPayload({
    stateDir: config.workDir,
    workDir: config.workDir,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'switch back to focus b first, then keep focus a warm',
        focusId: 'focus-b',
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
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
        lastActivityAt: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'focus-b',
        title: 'Focus B',
        status: 'active',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:01.000Z',
        lastActivityAt: '2026-03-20T00:00:01.000Z',
      },
    ],
    workingFocusIds: ['focus-b', 'focus-a'],
    wakeProfile: 'user_input',
    packetMode: 'standard',
  })

  expect(payload.contextPacket.workingFocusIds).toEqual(['focus-b', 'focus-a'])
  expect(payload.prompt).toContain('"working_focus_ids": [')
  expect(payload.prompt).toContain('"focus-b"')
  expect(payload.prompt).toContain('"focus-a"')
})

test('manager prompt runtime, context packet, and state packet share one compact normalized workline set', async () => {
  readHistoryMock.mockClear()
  readMemoryEntriesMock.mockClear()

  const config = defaultConfig({
    workDir: '/tmp/mimikit-context-demand-normalized-worklines',
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
          text: 'continue the active threads',
          focusId: 'focus-1',
          createdAt: '2026-03-20T00:00:01.000Z',
        },
      ],
      results: [],
      tasks: [],
      promptSectionLimits: config.manager.promptSections,
      focuses: Array.from({ length: 6 }, (_, index) => ({
        id: `focus-${index + 1}`,
        title: `Focus ${index + 1}`,
        status: 'active' as const,
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: `2026-03-20T00:00:0${index}.000Z`,
        lastActivityAt: `2026-03-20T00:00:0${index}.000Z`,
      })),
      workingFocusIds: [
        ' focus-1 ',
        'focus-2',
        'focus-1',
        '   ',
        'focus-3',
        'focus-4',
        'focus-5',
        'focus-6',
      ],
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
        text: 'continue the active threads',
        focusId: 'focus-1',
        createdAt: '2026-03-20T00:00:01.000Z',
      },
    ],
    tasks: [],
    plans: [],
    actionFeedback: [],
    workingFocusIds: [
      ' focus-1 ',
      'focus-2',
      'focus-1',
      '   ',
      'focus-3',
      'focus-4',
      'focus-5',
      'focus-6',
    ],
    env: undefined,
    sectionPolicy,
  })

  expect(runtime.normalizedWorkingFocusIds).toEqual([
    'focus-1',
    'focus-2',
    'focus-3',
    'focus-4',
    'focus-5',
  ])
  expect(packets.contextPacket.workingFocusIds).toEqual(
    runtime.normalizedWorkingFocusIds,
  )
  expect(parsePromptJson(packets.statePacket)).toMatchObject({
    working_focus_ids: runtime.normalizedWorkingFocusIds,
  })
})

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
