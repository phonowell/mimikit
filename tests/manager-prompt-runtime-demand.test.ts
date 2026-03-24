import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPayload } from '../src/policy/prompts/build-prompts.js'
import { buildMemoryPromptScoreContext } from '../src/policy/prompts/manager-prompt-runtime-helpers.js'

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
        result: {
          taskId: 'task-1',
          status: 'partial',
          ok: false,
          output: 'Temporary rollout checklist',
          durationMs: 10,
          completedAt: '2026-03-20T00:01:00.000Z',
        },
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
