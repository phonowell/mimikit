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

test('runManagerCorrectionRounds keeps remember_memory when repeated user history supports it', async () => {
  mockRememberMemoryRound(
    '收到。',
    'session-remember-memory-repeated',
    [
      {
        name: 'remember_memory',
        attrs: {
          content: rememberMemoryContent,
        },
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-repeated-test',
  )

  await appendRepeatedRememberMemoryHistory(runtime)

  const result = await runRememberMemoryRound(runtime, '继续。')

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('收到。')
  expect(result.parsed.actions).toHaveLength(1)
  expect(result.parsed.actions[0]).toMatchObject({
    name: 'remember_memory',
    attrs: {
      content: rememberMemoryContent,
    },
  })
})
