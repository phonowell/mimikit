import { expect, test } from 'vitest'

import {
  appendRuntimeSignalFeedback,
  parseChatFeedback,
  readEvolveFeedback,
} from '../src/evolve/feedback.js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-evolve-chat-'))

test('parseChatFeedback detects slash and prefix forms', () => {
  expect(parseChatFeedback('/feedback 请减少废话')).toEqual({
    message: '请减少废话',
    severity: 'low',
  })
  expect(parseChatFeedback('反馈: 回答经常超时')).toEqual({
    message: '回答经常超时',
    severity: 'high',
  })
  expect(parseChatFeedback('feedback: too expensive')).toEqual({
    message: 'too expensive',
    severity: 'medium',
  })
})

test('appendRuntimeSignalFeedback appends runtime_signal record', async () => {
  const stateDir = await createTmpDir()
  await appendRuntimeSignalFeedback({
    stateDir,
    message: 'worker loop error: timeout',
    context: { note: 'worker_loop_error' },
  })
  const items = await readEvolveFeedback(stateDir)
  expect(items).toHaveLength(1)
  expect(items[0]?.kind).toBe('runtime_signal')
  expect(items[0]?.severity).toBe('high')
  expect(items[0]?.context?.note).toBe('worker_loop_error')
})
