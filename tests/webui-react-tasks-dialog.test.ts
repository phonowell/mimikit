import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { TasksDialog } from '../webui-src/components/TasksDialog.js'

import type { TaskView } from '../webui-src/types.js'

const noop = (): void => undefined

const createTask = (overrides: Partial<TaskView> = {}): TaskView => ({
  id: 'task-1',
  status: 'pending',
  provider: 'codex',
  title: 'Alpha task',
  resourceMode: 'write',
  createdAt: '2026-03-27T07:00:00.000Z',
  changeAt: '2026-03-27T07:05:00.000Z',
  ...overrides,
})

test('tasks dialog splits open and closed tasks into separate sections', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TasksDialog, {
      open: true,
      tasks: [
        createTask({ id: 'task-running', status: 'running', title: 'Running' }),
        createTask({ id: 'task-paused', status: 'paused', title: 'Paused' }),
        createTask({
          id: 'task-failed',
          status: 'failed',
          title: 'Failed',
          completedAt: '2026-03-27T07:06:00.000Z',
        }),
        createTask({
          id: 'task-done',
          status: 'succeeded',
          title: 'Done',
          completedAt: '2026-03-27T07:07:00.000Z',
        }),
      ],
      openMenuId: '',
      onClose: noop,
      onToggleMenu: noop,
      onTaskAction: noop,
      onRequestDelete: noop,
    }),
  )

  expect(markup).toContain('>Open 2<')
  expect(markup).toContain('>Closed 2<')
  expect(markup).toContain('data-task-group="open"')
  expect(markup).toContain('data-task-group="closed"')
  expect(markup).toContain('>Running<')
  expect(markup).toContain('>Paused<')
  expect(markup).toContain('>Failed<')
  expect(markup).toContain('>Done<')
})

test('tasks dialog expands closed tasks when no open tasks remain', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TasksDialog, {
      open: true,
      tasks: [
        createTask({
          id: 'task-failed',
          status: 'failed',
          title: 'Failed',
          completedAt: '2026-03-27T07:06:00.000Z',
        }),
      ],
      openMenuId: '',
      onClose: noop,
      onToggleMenu: noop,
      onTaskAction: noop,
      onRequestDelete: noop,
    }),
  )

  expect(markup).toContain('>Closed 1<')
  expect(markup).toContain('data-task-group="closed" open=""')
  expect(markup).not.toContain('>Open')
})

test('tasks dialog does not render copy feedback inline after copy id', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TasksDialog, {
      open: true,
      tasks: [createTask()],
      openMenuId: '',
      onClose: noop,
      onToggleMenu: noop,
      onTaskAction: noop,
      onRequestDelete: noop,
    }),
  )

  expect(markup).not.toContain('class="dialog-copy-feedback"')
  expect(markup).not.toContain('Task id copied')
  expect(markup).not.toContain('class="app-toast"')
})
