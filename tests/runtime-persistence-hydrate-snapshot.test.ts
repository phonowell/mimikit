import { expect, test } from 'vitest'

import { createDefaultMemoryRefreshState } from '../src/memory/refresh/state.js'
import { persistRuntimeState } from '../src/orchestrator/core/runtime-persistence.js'
import { hydrateRuntimeState } from '../src/orchestrator/core/runtime-persistence.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const SNAPSHOT_BASE_TIME = '2026-02-06T00:00:00.000Z'

test('hydrateRuntimeState restores persisted snapshot slices through one hydrate seam', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      tasks: [
        {
          id: 'task-hydrate-slice',
          fingerprint: 'fp-task-hydrate-slice',
          prompt: 'hydrate state slices',
          title: 'Hydrate Slice',
          cwd: '/tmp/hydrate-slice',
          focusId: 'focus-release',
          profile: 'worker',
          provider: 'codex',
          status: 'pending',
          createdAt: SNAPSHOT_BASE_TIME,
        },
      ],
      taskPlans: [
        {
          id: 'plan-hydrate-slice',
          prompt: 'keep hydrating',
          title: 'Hydrate Slice Plan',
          focusId: 'focus-release',
          profile: 'worker',
          priority: 'normal',
          source: 'user_request',
          status: 'active',
          trigger: {
            mode: 'scheduled_at',
            scheduledAt: '2026-02-06T00:15:00.000Z',
          },
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          runCount: 0,
        },
      ],
      focuses: [
        {
          id: 'focus-release',
          title: 'Release',
          status: 'active',
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          lastActivityAt: SNAPSHOT_BASE_TIME,
        },
      ],
      focusDigests: [
        {
          focusId: 'focus-global',
          summary: 'ignore reserved digest',
          updatedAt: SNAPSHOT_BASE_TIME,
        },
        {
          focusId: 'focus-release',
          summary: 'ship phase2',
          updatedAt: SNAPSHOT_BASE_TIME,
        },
      ],
      session: {
        channelTargets: {
          telegramChatId: ' chat-1001 ',
        },
      },
      manager: {
        turn: 7,
        threadId: 'thread-hydrate-slice',
        memoryRefresh: {
          lastCompletedTurn: 5,
          lastProcessedInputsCursor: 3,
          lastProcessedResultsCursor: 2,
          running: true,
          pending: true,
        },
      },
      ui: {
        pendingUserChoices: [
          {
            id: 'choice-delivery',
            question: 'Ship now?',
            options: [
              {
                id: 'option-ship-now',
                label: 'Ship now',
                reason: 'Deliver immediately',
              },
              {
                id: 'option-keep-paused',
                label: 'Keep paused',
                reason: 'Review first',
              },
            ],
            defaultOptionId: 'option-keep-paused',
            createdAt: SNAPSHOT_BASE_TIME,
            focusId: 'focus-release',
            effect: {
              type: 'resume_task',
              taskId: 'task-hydrate-slice',
              optionId: 'option-ship-now',
              reason: 'review_before_ship',
            },
          },
        ],
      },
      queues: {
        inputsCursor: 3,
        resultsCursor: 2,
      },
    },
  })
  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: runtime.config.workDir,
    patch: {
      manager: {
        threadId: 'thread-stale',
        lastContextPacket: {
          id: 'packet-stale',
          createdAt: SNAPSHOT_BASE_TIME,
          wakeProfile: 'user_input',
          mode: 'minimal',
          counts: {
            inputs: 0,
            results: 0,
            tasks: 0,
            plans: 0,
            workingFocuses: 0,
          },
          includedSections: [],
          prunedSections: [],
        },
        lastUsage: { input: 1, output: 2, total: 3 },
        usageTotal: { input: 4, output: 5, total: 9 },
      },
      session: {
        channelTargets: {
          feishuChatId: 'oc_stale',
        },
      },
    },
  })

  await hydrateRuntimeState(restored)

  expect(restored.tasks.map((task) => task.id)).toEqual(['task-hydrate-slice'])
  expect(restored.taskPlans.map((plan) => plan.id)).toEqual([
    'plan-hydrate-slice',
  ])
  expect(restored.focuses.map((focus) => focus.id)).toEqual(['focus-release'])
  expect(restored.focusDigests.map((digest) => digest.focusId)).toEqual([
    'focus-release',
  ])
  expect(restored.manager.turn).toBe(7)
  expect(restored.manager.threadId).toBe('thread-hydrate-slice')
  expect(restored.manager.memoryRefresh).toEqual({
    ...createDefaultMemoryRefreshState(),
    lastCompletedTurn: 5,
  })
  expect(restored.manager.lastContextPacket).toBeUndefined()
  expect(restored.manager.lastUsage).toBeUndefined()
  expect(restored.manager.usageTotal).toBeUndefined()
  expect(restored.ui.pendingUserChoices.map((choice) => choice.id)).toEqual([
    'choice-delivery',
  ])
  expect(restored.session.channelTargets).toEqual({
    telegramChatId: 'chat-1001',
  })
  expect(restored.queues).toEqual({ inputsCursor: 0, resultsCursor: 0 })
})
