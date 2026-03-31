import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { PlanListItem } from '../webui-src/components/PlanListItem.js'

import type { PlanView } from '../webui-src/types.js'

const createPlan = (overrides: Partial<PlanView> = {}): PlanView => ({
  id: 'plan-1',
  title: 'Alpha plan',
  status: 'active',
  updatedAt: '2026-03-28T07:05:00.000Z',
  lastTaskId: 'task-1',
  trigger: { mode: 'cron', cron: '0 * * * *' },
  ...overrides,
})

const noop = (): void => undefined

test('plan list item shows copy id inside the opened overflow menu', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(PlanListItem, {
      open: true,
      plan: createPlan(),
      openMenuId: 'plan-1',
      onPlanAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).toContain('plan-more-toggle')
  expect(markup).toContain('aria-haspopup="menu"')

  const actionsIndex = markup.indexOf('data-plan-actions="true"')
  const menuIndex = markup.indexOf('>copy id<')

  expect(actionsIndex).toBeGreaterThan(-1)
  expect(menuIndex).toBeGreaterThan(actionsIndex)
  expect(markup).not.toContain('class="plan-item-menu-slot"')
})

test('plan list item keeps static body when lastTaskId is missing and still renders menu', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(PlanListItem, {
      open: true,
      plan: createPlan({ id: 'plan-2', lastTaskId: undefined }),
      openMenuId: 'plan-2',
      onPlanAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).not.toContain('href=')
  expect(markup).toContain('class="plan-link"')
  expect(markup).toContain('>copy id<')
})

test('plan list item keeps task contract behind a collapsed disclosure by default', () => {
  Object.assign(globalThis, { React })
  const plan = createPlan({ id: 'plan-3' }) as PlanView & {
    taskContract: {
      goal: string
      scope: string
      acceptance: string[]
      outOfScope: string
      contextRefs: string[]
    }
  }
  plan.taskContract = {
    goal: 'Expose contract goal',
    scope: 'Render contract scope in the plans dialog',
    acceptance: ['Acceptance item one', 'Acceptance item two'],
    outOfScope: 'Do not expose the raw worker prompt',
    contextRefs: ['docs/design/workflow/plan.md'],
  }

  const markup = renderToStaticMarkup(
    React.createElement(PlanListItem, {
      open: true,
      plan,
      openMenuId: 'plan-3',
      onPlanAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).toContain('class="plan-contract"')
  expect(markup).toContain('class="plan-contract-summary"')
  expect(markup).toContain('>View contract<')
  expect(markup).not.toContain('class="plan-contract" open=""')
  expect(markup).toContain('Expose contract goal')
  expect(markup).toContain('Render contract scope in the plans dialog')
  expect(markup).toContain('Acceptance item one')
  expect(markup).toContain('Do not expose the raw worker prompt')
  expect(markup).toContain('docs/design/workflow/plan.md')
})

test('plan list item renders runtime progress inline when available', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(PlanListItem, {
      open: true,
      plan: createPlan({
        id: 'plan-progress-ui',
        lastTaskId: 'task-progress-ui',
        runCount: 7,
        lastTriggeredAt: '2026-03-29T11:57:56.768Z',
      } as PlanView),
      openMenuId: 'plan-progress-ui',
      onPlanAction: noop,
      onToggleMenu: noop,
    }),
  )

  expect(markup).toContain('Runs')
  expect(markup).toContain('7')
  expect(markup).toContain('Last trigger')
})
