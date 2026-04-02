import { beforeEach, expect, test } from 'vitest'

import {
  createRememberMemoryRuntime,
  mockRememberMemoryRound,
  rememberMemoryContent,
  resetRememberMemoryMocks,
  runRememberMemoryRound,
} from './manager-remember-memory-suppression/testkit.js'

beforeEach(() => {
  resetRememberMemoryMocks()
})

test('runManagerCorrectionRounds drops invalid remember_memory action without poisoning the main reply', async () => {
  mockRememberMemoryRound(
    '后续我会继续用中文简洁回复。',
    'session-remember-memory-invalid-source-input',
    [
      {
        type: 'remember_memory',
        content: rememberMemoryContent,
        source_input_id: 'input-other',
      },
    ],
  )

  const runtime = await createRememberMemoryRuntime(
    '/tmp/mimikit-remember-memory-invalid-source-input-test',
  )

  const result = await runRememberMemoryRound(
    runtime,
    '后续都请保持中文且简洁回复。',
  )

  expect(result.roundLimitReached).toBeUndefined()
  expect(result.parsed.text).toBe('后续我会继续用中文简洁回复。')
  expect(result.parsed.actions).toHaveLength(0)
})
