import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { Header } from '../webui-src/components/Header.js'

const noop = (): void => undefined

test('header only exposes plans and tasks dialogs as top-level work surfaces', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(Header, {
      statusText: 'Idle',
      statusState: 'idle',
      workerStates: ['idle'],
      hasPlans: true,
      toolsMenuOpen: true,
      toolsDisabled: false,
      onOpenPlans: noop,
      onOpenTasks: noop,
      onPreloadPlans: noop,
      onPreloadTasks: noop,
      onToggleTools: noop,
      onToggleDeleteMode: noop,
      onOpenRestart: noop,
      onOpenReset: noop,
    }),
  )

  expect(markup).toContain('aria-label="Plans"')
  expect(markup).toContain('aria-label="Tasks"')
  expect(markup).not.toContain('Voice replies')
  expect(markup).not.toContain('menuitemcheckbox')
  expect(markup).not.toContain('aria-label="Focus"')
  expect(markup).not.toContain('focuses-dialog')
})
