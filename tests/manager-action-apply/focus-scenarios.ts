import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'

import { createRuntime, TASK_CWD } from './testkit.js'

test('assign_focus updates task focus by explicit target_type', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-focus-1',
    fingerprint: 'fp-1',
    prompt: 'do something',
    title: 'focus task',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })
  runtime.focuses.push({
    id: 'focus-release',
    title: 'Release',
    status: 'active',
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    lastActivityAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'assign_focus',
      attrs: {
        target_type: 'task',
        target_id: 'task-focus-1',
        focus_id: 'focus-release',
      },
    },
  ])

  expect(runtime.tasks[0]?.focusId).toBe('focus-release')
})

test('upsert_focus accepts open_item_{n} scalar attrs and writes openItems', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-release',
        title: 'Release',
        summary: 'Track release readiness',
        open_item_1: '确认回滚路径',
        open_item_2: '补齐发布清单',
      },
    },
  ])

  const focus = runtime.focuses.find((item) => item.id === 'focus-release')
  expect(focus?.title).toBe('Release')
  expect(focus?.summary).toBe('Track release readiness')
  expect(focus?.openItems).toEqual(['确认回滚路径', '补齐发布清单'])
})
