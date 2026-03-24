import { expect, test } from 'vitest'

import {
  buildFeedbackActionLogEntry,
  buildLifecycleActionLogEntry,
} from '../src/policy/manager/action-cli-log-payload.js'

import type { Parsed } from '../src/policy/actions/model/spec.js'
import type { ManagerActionFeedback } from '../src/foundation/types/index.js'

const createParsed = (
  name: string,
  attrs: Record<string, string>,
): Parsed => ({
  name,
  attrs,
})

test('buildLifecycleActionLogEntry redacts sensitive attrs and resolves task id', () => {
  const entry = buildLifecycleActionLogEntry({
    stage: 'running',
    item: createParsed('enqueue_task', {
      id: 'task-101',
      access_token: 'secret-token',
      note: '  collect   logs  ',
    }),
    index: 1,
    total: 2,
  })

  expect(entry.stage).toBe('running')
  expect(entry.actionId).toBe('task-101')
  expect(entry.taskId).toBe('task-101')
  expect(entry.attrCount).toBe(3)
  expect(entry.attrs?.access_token).toBe('[REDACTED]')
  expect(entry.attrs?.note).toBe('collect logs')
})

test('buildFeedbackActionLogEntry maps rejected stage and extracts ids from attempted attrs', () => {
  const feedback: ManagerActionFeedback = {
    action: 'mutate_task',
    error: 'action_execution_rejected',
    hint: '请提供更明确的 task id',
    attempted: 'name="mutate_task" id="task-202" last_task_id="task-202"',
  }
  const entry = buildFeedbackActionLogEntry({
    item: feedback,
    index: 2,
    total: 2,
  })

  expect(entry.stage).toBe('rejected')
  expect(entry.actionId).toBe('task-202')
  expect(entry.taskId).toBe('task-202')
  expect(entry.error).toBe('action_execution_rejected')
  expect(entry.hint).toBe('请提供更明确的 task id')
})
