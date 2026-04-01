import { beforeEach, expect, test, vi } from 'vitest'

import { attachProviderThreadId } from '../src/execution/providers/thread-id.js'

const hoistedMocks = vi.hoisted(() => ({
  appendTraceArchiveResultMock: vi.fn(),
  buildManagerPromptPayloadMock: vi.fn(),
  runManagerLlmCallMock: vi.fn(),
}))

vi.mock('../src/persistence/storage/traces-archive.js', () => ({
  appendTraceArchiveResult: hoistedMocks.appendTraceArchiveResultMock,
  toTraceRef: (stateDir: string, tracePath: string) =>
    tracePath.startsWith(`${stateDir}/`)
      ? `.mimikit/${tracePath.slice(stateDir.length + 1)}`
      : undefined,
}))

vi.mock('../src/policy/prompts/build-prompts.js', () => ({
  buildManagerPromptPayload: hoistedMocks.buildManagerPromptPayloadMock,
}))

vi.mock('../src/policy/manager/manager-llm-call.js', () => ({
  runManagerLlmCall: hoistedMocks.runManagerLlmCallMock,
}))

const { runManager } = await import('../src/policy/manager/runner.js')

beforeEach(() => {
  hoistedMocks.appendTraceArchiveResultMock.mockReset()
  hoistedMocks.buildManagerPromptPayloadMock.mockReset()
  hoistedMocks.runManagerLlmCallMock.mockReset()
  hoistedMocks.buildManagerPromptPayloadMock.mockResolvedValue({
    prompt: 'manager prompt',
    promptSegments: [{ text: 'manager prompt' }],
    contextPacket: {
      id: 'packet-context-1',
      createdAt: '2026-04-01T00:00:00.000Z',
      wakeProfile: 'user_input',
      mode: 'standard',
      counts: {
        inputs: 1,
        results: 0,
        tasks: 0,
        plans: 0,
        workingFocuses: 1,
      },
      activeTaskIds: [],
      workingFocusIds: ['focus-global'],
    },
    promptSections: {
      system: 100,
      action_surface: 100,
      state_packet: 300,
      event_packet: 200,
      project_profile: 100,
      remembered_memory: 100,
      memory: 124,
    },
    promptSelection: {
      tasks: { selected: 0, full: 0, card: 0 },
      plans: { selected: 0, full: 0, card: 0 },
    },
  })
})

test('runManager attaches traceRef to thrown provider errors after archiving the failed trace', async () => {
  hoistedMocks.appendTraceArchiveResultMock.mockResolvedValue(
    '/tmp/mimikit/traces/2026-04-01/manager-failure.txt',
  )
  hoistedMocks.runManagerLlmCallMock.mockRejectedValue(
    attachProviderThreadId(new Error('provider failed'), 'thread-manager-1'),
  )

  let caught: unknown
  try {
    await runManager({
      stateDir: '/tmp/mimikit',
      workDir: '/tmp/mimikit',
      inputs: [],
      results: [],
      tasks: [],
      promptSectionLimits: {
        actionFeedbackMaxBytes: 1024,
        batchResultsMaxBytes: 1024,
        environmentMaxBytes: 1024,
        focusListMaxBytes: 1024,
        inputsMaxBytes: 1024,
        memoryMaxBytes: 1024,
        plansMaxBytes: 1024,
        recentHistoryMaxBytes: 1024,
        tasksMaxBytes: 1024,
        workingFocusesMaxBytes: 1024,
      },
    })
  } catch (error) {
    caught = error
  }

  expect(Reflect.get(caught as object, 'traceRef')).toBe(
    '.mimikit/traces/2026-04-01/manager-failure.txt',
  )
})
