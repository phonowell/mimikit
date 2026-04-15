import { expect, test, vi } from 'vitest'

import { readJsonl } from '../src/persistence/storage/jsonl.js'
import { processManagerBatch } from '../src/policy/manager/loop-batch.js'
import { normalizeManagerReplyText } from '../src/policy/manager/reply-normalize.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

test('processManagerBatch flushes pending restart on no-reply fast path', async () => {
  const requestExitMock = vi.fn()
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-no-reply-restart',
    patch: {
      session: {
        pendingRestartReason: 'manager_restart_requested',
        requestExit: requestExitMock,
      },
    },
  })

  await processManagerBatch({
    runtime,
    inputs: [],
    results: [],
    nextInputsCursor: 0,
    nextResultsCursor: 0,
  })

  expect(requestExitMock).toHaveBeenCalledWith({
    code: 75,
    reason: 'manager_restart_requested',
    skipPersist: true,
  })
  expect(runtime.process.session.pendingRestartReason).toBeUndefined()

  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  expect(logs.at(-1)).toMatchObject({
    event: 'manager_end',
    status: 'ok',
    skippedReason: 'no_agent_visible_inputs',
  })
})

test('normalizeManagerReplyText strips internal action tags from user-visible replies', () => {
  const reply = normalizeManagerReplyText(
    `<M:enqueue_task title="继续推进 schema 收尾" />
当前进展不清楚。
下一步由 intent-evidence guard 和 schema 决定。`,
  )
  const lines = reply.split('\n')
  const leakedFragments = ['<M:', 'enqueue_task', 'intent-evidence', 'schema']

  expect(lines).toHaveLength(2)
  expect(lines[0]?.startsWith('当前进展')).toBe(true)
  expect(lines[1]?.startsWith('下一步')).toBe(true)
  expect(leakedFragments.some((fragment) => reply.includes(fragment))).toBe(
    false,
  )
})
