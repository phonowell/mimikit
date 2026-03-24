import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { resolveManagerActionSurface } from '../src/policy/manager/action-surface.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { UserInput } from '../src/foundation/types/index.js'

const createUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-23T08:00:00.000Z',
  focusId: 'focus-global',
})

test('task_result wake profile exposes restart_runtime', () => {
  const surface = resolveManagerActionSurface('task_result')

  expect(surface.actionNames.has('restart_runtime')).toBe(true)
})

test('restart_runtime is blocked without any direct current-batch user evidence', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'restart_runtime',
        attrs: {
          reason: '重启 mimikit 以应用刚完成的项目更新',
        },
      },
    ],
    {
      inputs: [],
      restartRuntimeAvailable: true,
      restartRuntimeScheduled: false,
      restartRuntimeBusy: false,
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('restart_runtime')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
})

test('restart_runtime is blocked without direct user restart intent evidence', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'restart_runtime',
        attrs: {
          reason: '重启 mimikit 以应用刚完成的项目更新',
        },
      },
    ],
    {
      inputs: [createUserInput('先总结这次更新做了什么，不要重启。')],
      supplementalEvidenceSources: new Set(['task_result']),
      restartRuntimeAvailable: true,
      restartRuntimeScheduled: false,
      restartRuntimeBusy: false,
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('restart_runtime')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
})

test('restart_runtime stays allowed for direct current-batch user request even without task_result evidence', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'restart_runtime',
        attrs: {
          reason: '更新完成后请重启 mimikit 让新代码生效',
        },
      },
    ],
    {
      inputs: [createUserInput('更新完成后请重启 mimikit 让新代码生效。')],
      restartRuntimeAvailable: true,
      restartRuntimeScheduled: false,
      restartRuntimeBusy: false,
    },
  )

  expect(feedback).toHaveLength(0)
})

test('restart_runtime is blocked when worker slots are not clear', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'restart_runtime',
        attrs: {
          reason: '重启 mimikit 以应用刚完成的项目更新',
        },
      },
    ],
    {
      inputs: [createUserInput('更新完成后请重启 mimikit 让新代码生效。')],
      restartRuntimeAvailable: true,
      restartRuntimeScheduled: false,
      restartRuntimeBusy: true,
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.hint).toContain('pending/running worker task')
})

test('restart_runtime schedules deferred restart and stops later actions in the batch', async () => {
  const exitRequests: Array<{ code: number; reason: string }> = []
  const runtime = await createTestRuntimeState({
    patch: {
      session: {
        requestExit: (request) => {
          exitRequests.push(request)
        },
      },
    },
  })

  await applyTaskActions(runtime, [
    {
      name: 'restart_runtime',
      attrs: {
        reason: '重启 mimikit 以应用刚完成的项目更新',
      },
    },
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-should-not-run',
        title: 'Should not run',
      },
    },
  ])

  expect(runtime.session.restartScheduled).toBe(true)
  expect(runtime.session.pendingRestartReason).toBe(
    '重启 mimikit 以应用刚完成的项目更新',
  )
  expect(exitRequests).toEqual([])
  expect(runtime.focuses.find((item) => item.id === 'focus-should-not-run')).toBe(
    undefined,
  )
})
