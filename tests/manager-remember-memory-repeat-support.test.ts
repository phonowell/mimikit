import { beforeEach, expect, test } from 'vitest'

import {
  appendRepeatedRememberMemoryHistory,
  createRememberMemoryRuntime,
  mockRememberMemoryRound,
  rememberMemoryContent,
  resetRememberMemoryMocks,
  runRememberMemoryRound,
} from './manager-remember-memory-suppression/testkit.js'

beforeEach(() => {
  resetRememberMemoryMocks()
})

test('runManagerCorrectionRounds keeps remember_memory action when current input anchors the source quote even if old history also matches', async () => {
  mockRememberMemoryRound(
    '我会记住这条规则。',
    'session-remember-memory-repeated',
    [
      {
        type: 'remember_memory',
        content: rememberMemoryContent,
        source_input_id: 'input-user',
        source_quote: '继续。',
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-repeated-test',
  )

  await appendRepeatedRememberMemoryHistory(runtime)

  const result = await runRememberMemoryRound(runtime, '继续。')

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('我会记住这条规则。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    type: 'remember_memory',
  })
})
