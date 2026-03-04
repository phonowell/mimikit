import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { readHistory } from '../src/history/store.js'
import {
  buildConversationSummaryForReset,
  injectPendingRestartSummary,
  stagePendingRestartSummary,
} from '../src/orchestrator/core/restart-summary.js'
import type { FocusView } from '../src/orchestrator/read-model/focus-view.js'
import type { TaskCounts, TaskView } from '../src/orchestrator/read-model/task-view.js'
import {
  readPendingRestartSummary,
  writePendingRestartSummary,
} from '../src/storage/pending-restart-summary.js'
import type { PendingUserChoice, TaskPlan } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-restart-summary-'))

test('restart summary includes runtime snapshot sections when context is available', () => {
  const tasks: TaskView[] = [
    {
      id: 'task-release-1',
      kind: 'task',
      status: 'running',
      profile: 'worker',
      focusId: 'focus-release',
      title: 'Prepare release checklist',
      createdAt: '2026-03-03T00:00:00.000Z',
      changeAt: '2026-03-03T00:05:00.000Z',
    },
  ]
  const taskCounts: TaskCounts = {
    pending: 1,
    running: 1,
    succeeded: 2,
    failed: 0,
    canceled: 0,
  }
  const plans: TaskPlan[] = [
    {
      id: 'plan-release-1',
      prompt: 'Run release checks every idle period',
      title: 'Release checks',
      focusId: 'focus-release',
      profile: 'worker',
      priority: 'high',
      source: 'user_request',
      status: 'active',
      trigger: {
        mode: 'on_idle',
        cooldownMs: 30000,
      },
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:10:00.000Z',
      runCount: 1,
      lastTriggeredAt: '2026-03-03T00:05:00.000Z',
      lastTaskId: 'task-release-1',
    },
  ]
  const focuses: FocusView[] = [
    {
      id: 'focus-release',
      title: 'Release 1.2',
      status: 'active',
      isActive: true,
      updatedAt: '2026-03-03T00:10:00.000Z',
      lastActivityAt: '2026-03-03T00:10:00.000Z',
      summary: 'Finalize release quality checks',
      openItems: ['Run smoke test', 'Verify changelog'],
    },
  ]
  const pendingChoice: PendingUserChoice = {
    id: 'choice-release-1',
    question: 'Should we ship now or wait for one more regression run?',
    options: [
      {
        id: 'option-ship',
        label: 'Ship now',
        reason: 'No blockers were found in the latest smoke run',
      },
      {
        id: 'option-wait',
        label: 'Wait for regression run',
        reason: 'Adds confidence for higher-risk release windows',
      },
    ],
    defaultOptionId: 'option-ship',
    createdAt: '2026-03-03T00:09:00.000Z',
    expiresAt: '2026-03-03T00:19:00.000Z',
    focusId: 'focus-release',
  }

  const summary = buildConversationSummaryForReset({
    messages: [
      {
        id: 'input-1',
        role: 'user',
        text: 'Summarize what we still need before release.',
        createdAt: '2026-03-03T00:00:00.000Z',
        focusId: 'focus-release',
      },
      {
        id: 'msg-1',
        role: 'agent',
        text: 'Two checks remain: smoke test and changelog verification.',
        createdAt: '2026-03-03T00:00:05.000Z',
        focusId: 'focus-release',
      },
    ],
    tasks,
    taskCounts,
    plans,
    focuses,
    pendingChoice,
  })

  expect(summary).toContain('Conversation highlights before reset')
  expect(summary).toContain('Task snapshot before reset')
  expect(summary).toContain('Plan snapshot before reset')
  expect(summary).toContain('Focus snapshot before reset')
  expect(summary).toContain('Pending decision before reset')
})

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
