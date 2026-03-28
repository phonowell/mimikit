import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { PlansDialog } from '../webui-src/components/PlansDialog.js'

import type { PlanView } from '../webui-src/types.js'

const noop = (): void => undefined

const createPlan = (overrides: Partial<PlanView> = {}): PlanView => ({
  id: 'plan-1',
  title: 'Alpha plan',
  status: 'active',
  updatedAt: '2026-03-28T07:05:00.000Z',
  lastTaskId: 'task-1',
  trigger: { mode: 'cron', cron: '0 * * * *' },
  ...overrides,
})

test('plans dialog forwards the opened menu state to the selected plan item', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(PlansDialog, {
      copyFeedback: null,
      open: true,
      plans: [createPlan()],
      openMenuId: 'plan-1',
      onClearCopyFeedback: noop,
      onClose: noop,
      onPlanAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).toContain('plan-more-toggle')
  expect(markup).toContain('>copy id<')
})

test('plans dialog renders copy feedback inline instead of a global toast slot', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(PlansDialog, {
      copyFeedback: {
        message: 'Plan id copied',
        state: 'success',
      },
      open: true,
      plans: [createPlan()],
      openMenuId: 'plan-1',
      onClearCopyFeedback: noop,
      onClose: noop,
      onPlanAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).toContain('class="dialog-copy-feedback"')
  expect(markup).toContain('Plan id copied')
  expect(markup).toContain('data-state="success"')
  expect(markup).not.toContain('class="app-toast"')
})
