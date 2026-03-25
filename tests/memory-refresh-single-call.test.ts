import { beforeEach, expect, test, vi } from 'vitest'

import { runMemoryRefreshSingleCall } from '../src/policy/memory/refresh/single-call.js'

const { runManagerLlmCallMock } = vi.hoisted(() => ({
  runManagerLlmCallMock: vi.fn(),
}))

vi.mock('../src/policy/manager/manager-llm-call.js', () => ({
  runManagerLlmCall: runManagerLlmCallMock,
}))

beforeEach(() => {
  runManagerLlmCallMock.mockReset()
})

const buildPayload = (memoryMarkdown = '# Memory') => ({
  workDir: '/tmp/mimikit',
  model: 'gpt-5-mini',
  memoryMarkdown,
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
})

test('single-call renders input yaml via prompt template', async () => {
  runManagerLlmCallMock.mockResolvedValue({
    output: JSON.stringify({
      mode: 'patch',
      reason: 'ready',
      delete_entry_ids: [],
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

  const payload = buildPayload()

  const result = await runMemoryRefreshSingleCall({ payload })
  expect(result.mode).toBe('patch')
  expect(result.entries).toHaveLength(1)
  expect(result.deleteEntryIds).toEqual([])
  expect(result.entries[0]?.evidenceIds).toEqual(['input-1'])

  expect(runManagerLlmCallMock).toHaveBeenCalledTimes(1)
  const [call] = runManagerLlmCallMock.mock.calls
  const callParams = call?.[0] as { prompt?: string; model?: string } | undefined
  expect(callParams?.prompt).toContain('# Input(YAML)')
  expect(callParams?.prompt).toContain('workDir: /tmp/mimikit')
  expect(callParams?.prompt).not.toContain('{{ input_yaml }}')
  expect(callParams?.model).toBe('gpt-5-mini')
})

test('single-call accepts delete-only patch when entry id exists in memory', async () => {
  runManagerLlmCallMock.mockResolvedValue({
    output: JSON.stringify({
      mode: 'patch',
      reason: 'forget_instruction_detected',
      delete_entry_ids: ['memory-oldpref'],
      entries: [],
    }),
    elapsedMs: 5,
  })

  const payload = buildPayload(
    [
      '## [memory-entry] (id:memory-oldpref)',
      'title: Deprecated preference',
      'updated_at: 2026-03-01T00:00:00.000Z',
      'source: remember',
      '',
      'Always use old API v1.',
      '',
    ].join('\n'),
  )

  const result = await runMemoryRefreshSingleCall({ payload })
  expect(result.mode).toBe('patch')
  expect(result.entries).toHaveLength(0)
  expect(result.deleteEntryIds).toEqual(['memory-oldpref'])
})

test('single-call drops invalid delete ids and downgrades to noop', async () => {
  runManagerLlmCallMock.mockResolvedValue({
    output: JSON.stringify({
      mode: 'patch',
      reason: 'delete_requested',
      delete_entry_ids: ['memory-not-exist'],
      entries: [],
    }),
    elapsedMs: 5,
  })

  const result = await runMemoryRefreshSingleCall({
    payload: buildPayload('# Empty memory'),
  })
  expect(result.mode).toBe('noop')
  expect(result.reason).toBe('invalid_delete_entry_ids')
  expect(result.deleteEntryIds).toEqual([])
})
