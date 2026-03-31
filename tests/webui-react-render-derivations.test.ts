import { expect, test } from 'vitest'

import { buildQuotedMessagesIndex } from '../webui-src/components/MessageList.js'
import { partitionTasksByStatus } from '../webui-src/components/TasksDialog.js'

import type { ChatMessage, TaskView } from '../webui-src/types.js'

const createTask = (overrides: Partial<TaskView> = {}): TaskView => ({
  id: 'task-1',
  status: 'pending',
  provider: 'codex',
  title: 'Task',
  createdAt: '2026-03-31T08:00:00.000Z',
  changeAt: '2026-03-31T08:05:00.000Z',
  ...overrides,
})

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  role: 'user',
  text: 'hello',
  ...overrides,
})

test('partitionTasksByStatus preserves task order within open and closed groups', () => {
  const { closedTasks, openTasks } = partitionTasksByStatus([
    createTask({ id: 'task-pending', status: 'pending' }),
    createTask({ id: 'task-failed', status: 'failed' }),
    createTask({ id: 'task-running', status: 'running' }),
    createTask({ id: 'task-succeeded', status: 'succeeded' }),
    createTask({ id: 'task-paused', status: 'paused' }),
  ])

  expect(openTasks.map((task) => task.id)).toEqual([
    'task-pending',
    'task-running',
    'task-paused',
  ])
  expect(closedTasks.map((task) => task.id)).toEqual([
    'task-failed',
    'task-succeeded',
  ])
})

test('buildQuotedMessagesIndex skips allocation when no quoted messages exist', () => {
  expect(
    buildQuotedMessagesIndex([
      createMessage({ id: 'message-1', text: 'plain user message' }),
      createMessage({
        id: 'message-2',
        role: 'agent',
        text: 'plain agent message',
      }),
    ]),
  ).toBeNull()
})

test('buildQuotedMessagesIndex indexes id-bearing messages once quotes appear', () => {
  const index = buildQuotedMessagesIndex([
    createMessage({ id: 'message-1', text: 'quoted base' }),
    createMessage({
      id: 'message-2',
      role: 'agent',
      quote: 'message-1',
      text: 'reply with quote',
    }),
    createMessage({ id: null, role: 'system', text: 'ephemeral status' }),
  ])

  expect(index?.get('message-1')?.text).toBe('quoted base')
  expect(index?.has('message-2')).toBe(true)
  expect(index?.has('')).toBe(false)
})
