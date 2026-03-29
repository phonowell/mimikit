import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { TaskMeta } from '../webui-src/components/TaskMeta.js'

import type { TaskView } from '../webui-src/types.js'

const createTask = (overrides: Partial<TaskView> = {}): TaskView => ({
  id: 'task-1',
  status: 'succeeded',
  title: 'Close task',
  createdAt: '2026-03-29T11:50:00.000Z',
  changeAt: '2026-03-29T11:58:00.000Z',
  ...overrides,
})

test('task meta renders git closure badges when available', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(TaskMeta, {
      open: true,
      task: createTask({
        gitClosure: {
          reviewPassed: true,
          merged: true,
          cleaned: false,
        },
      }),
    }),
  )

  expect(markup).toContain('review')
  expect(markup).toContain('merged')
  expect(markup).toContain('cleanup pending')
})
