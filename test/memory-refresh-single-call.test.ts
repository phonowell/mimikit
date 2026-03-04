import { beforeEach, expect, test, vi } from 'vitest'

import { runMemoryRefreshSingleCall } from '../src/memory/refresh/single-call.js'

const { runManagerLlmCallMock } = vi.hoisted(() => ({
  runManagerLlmCallMock: vi.fn(),
}))

vi.mock('../src/manager/manager-llm-call.js', () => ({
  runManagerLlmCall: runManagerLlmCallMock,
}))

beforeEach(() => {
  runManagerLlmCallMock.mockReset()
})

test('single-call renders input json via prompt template', async () => {
  runManagerLlmCallMock.mockResolvedValue({
    output: JSON.stringify({
      mode: 'patch',
      reason: 'ready',
      harvest: { mode: 'patch', reason: 'harvested' },
      curate: { mode: 'patch', reason: 'curated' },
      compress: { mode: 'patch', reason: 'compressed' },
      entries: [
        {
          title: 'Project preference',
          content: 'Use strict typing',
          evidence_ids: ['input-1'],
        },
      ],
    }),
    elapsedMs: 5,
  })

  const payload = {
    workDir: '/tmp/mimikit',
    model: 'gpt-5-mini',
    memoryMarkdown: '# Memory',
    signals: [
      {
        id: 'input-1',
        role: 'user' as const,
        createdAt: '2026-03-04T00:00:00.000Z',
        text: 'Prefer strict types',
      },
    ],
    tasks: [],
    plans: [],
  }

  const result = await runMemoryRefreshSingleCall({ payload })
  expect(result.mode).toBe('patch')
  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]?.evidenceIds).toEqual(['input-1'])

  expect(runManagerLlmCallMock).toHaveBeenCalledTimes(1)
  const [call] = runManagerLlmCallMock.mock.calls
  const callParams = call?.[0] as { prompt?: string; model?: string } | undefined
  expect(callParams?.prompt).toContain('# Input(JSON)')
  expect(callParams?.prompt).toContain('"workDir":"/tmp/mimikit"')
  expect(callParams?.prompt).not.toContain('{{ input_json }}')
  expect(callParams?.model).toBe('gpt-5-mini')
})
