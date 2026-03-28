import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { TaskListItem } from '../webui-src/components/TaskListItem.js'

import type { TaskView } from '../webui-src/types.js'

const createTask = (overrides: Partial<TaskView> = {}): TaskView => ({
  id: 'task-1',
  status: 'running',
  provider: 'codex',
  title: 'Alpha task',
  createdAt: '2026-03-27T07:00:00.000Z',
  changeAt: '2026-03-27T07:05:00.000Z',
  liveOutput: 'working',
  ...overrides,
})

const noop = (): void => undefined

test('task list item hides provider chip and shows copy id first in menu', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TaskListItem, {
      open: true,
      task: createTask(),
      openMenuId: 'task-1',
      onRequestDelete: noop,
      onTaskAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).not.toContain('provider: codex')
  expect(markup).not.toContain('>codex<')

  const copyIdIndex = markup.indexOf('>copy id<')
  const pauseIndex = markup.indexOf('>pause<')
  const cancelIndex = markup.indexOf('>cancel<')
  const deleteIndex = markup.indexOf('>delete<')

  expect(copyIdIndex).toBeGreaterThan(-1)
  expect(copyIdIndex).toBeLessThan(pauseIndex)
  expect(copyIdIndex).toBeLessThan(cancelIndex)
  expect(copyIdIndex).toBeLessThan(deleteIndex)
})

test('task list item does not show trace link even when traceRef exists', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TaskListItem, {
      open: true,
      task: createTask({
        traceRef: '.mimikit/traces/2026-03-27/worker-trace.txt',
      }),
      openMenuId: 'task-1',
      onRequestDelete: noop,
      onTaskAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).not.toContain('>trace<')
  expect(markup).not.toContain(
    '/state-files/traces/2026-03-27/worker-trace.txt',
  )
})

test('task list item keeps the opened menu out of the card flow slot', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TaskListItem, {
      open: true,
      task: createTask(),
      openMenuId: 'task-1',
      onRequestDelete: noop,
      onTaskAction: noop,
      onToggleMenu: noop,
    }),
  )

  const actionsIndex = markup.indexOf('data-task-actions="true"')
  const menuIndex = markup.indexOf('class="task-more-menu"')

  expect(actionsIndex).toBeGreaterThan(-1)
  expect(menuIndex).toBeGreaterThan(actionsIndex)
  expect(markup).not.toContain('class="task-item-menu-slot"')
})
