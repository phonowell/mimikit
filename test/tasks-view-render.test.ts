import { expect, test } from 'vitest'

import { resolveTaskUsageDisplay } from '../webui/tasks-view-render.js'

test('resolveTaskUsageDisplay shows formatted usage for running tasks', () => {
  const display = resolveTaskUsageDisplay({
    input: 1200,
    output: 800,
    total: 2000,
  })
  expect(display.hasUsage).toBe(true)
  expect(display.text).toContain('↑')
  expect(display.text).toContain('↓')
  expect(display.text).not.toBe('-')
})

test('resolveTaskUsageDisplay shows dash when usage is missing', () => {
  const display = resolveTaskUsageDisplay(undefined)
  expect(display).toEqual({
    text: '-',
    title: '',
    hasUsage: false,
  })
})
