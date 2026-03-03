import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { readHistory } from '../src/history/store.js'
import {
  injectPendingRestartSummary,
  stagePendingRestartSummary,
} from '../src/orchestrator/core/restart-summary.js'
import {
  readPendingRestartSummary,
  writePendingRestartSummary,
} from '../src/storage/pending-restart-summary.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-restart-summary-'))

test('pending restart summary is injected only once even after repeated retries', async () => {
  const workDir = await createTmpDir()
  const paths = buildPaths(workDir)

  await stagePendingRestartSummary({
    stateDir: workDir,
    runtimeId: 'runtime-stage-1',
    messages: [
      {
        id: 'input-1',
        role: 'user',
        text: 'Please remember this context.',
        createdAt: '2026-03-03T00:00:00.000Z',
        focusId: 'focus-global',
      },
      {
        id: 'msg-1',
        role: 'agent',
        text: 'I prepared a release checklist.',
        createdAt: '2026-03-03T00:00:05.000Z',
        focusId: 'focus-global',
      },
    ],
  })

  await injectPendingRestartSummary({
    stateDir: workDir,
    historyDir: paths.history,
    runtimeId: 'runtime-restore-1',
    focusId: 'focus-global',
  })

  const firstHistory = await readHistory(paths.history)
  const firstRestoreMessages = firstHistory.filter((item) =>
    item.text.includes('session_summary_restored'),
  )
  expect(firstRestoreMessages).toHaveLength(1)

  const consumed = await readPendingRestartSummary(workDir)
  expect(consumed?.consumed).toBe(true)

  if (!consumed) throw new Error('expected staged summary to exist')
  await writePendingRestartSummary(workDir, {
    ...consumed,
    consumed: false,
    consumedAt: undefined,
    injectedMessageId: undefined,
  })

  await injectPendingRestartSummary({
    stateDir: workDir,
    historyDir: paths.history,
    runtimeId: 'runtime-restore-2',
    focusId: 'focus-global',
  })

  const secondHistory = await readHistory(paths.history)
  const secondRestoreMessages = secondHistory.filter((item) =>
    item.text.includes('session_summary_restored'),
  )
  expect(secondRestoreMessages).toHaveLength(1)

  const consumedAfterRetry = await readPendingRestartSummary(workDir)
  expect(consumedAfterRetry?.consumed).toBe(true)
})
