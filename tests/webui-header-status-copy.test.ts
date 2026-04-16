import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { Header } from '../webui-src/components/Header.js'

globalThis.React = React
const noop = () => undefined

test('Header keeps status summary without rendering extra status copy', () => {
  const headerProps: React.ComponentProps<typeof Header> = {
    statusText: 'Running',
    statusState: 'running',
    workerStates: ['running'],
    hasPlans: true,
    toolsMenuOpen: false,
    toolsDisabled: false,
    onOpenPlans: noop,
    onOpenTasks: noop,
    onPreloadPlans: noop,
    onPreloadTasks: noop,
    onToggleTools: noop,
    onToggleDeleteMode: noop,
    onOpenRestart: noop,
    onOpenReset: noop,
  }
  const legacyStatusCopy = {
    [['quality', 'Summary'].join('')]: '2 plans active',
  }
  const markup = renderToStaticMarkup(
    React.createElement(Header, { ...headerProps, ...legacyStatusCopy }),
  )

  expect(markup).toContain('Running')
  expect(markup).not.toContain('2 plans active')
  expect(markup).not.toContain('status-copy')
  expect(markup).toContain(
    '<p class="status-item"><span class="status-dot" data-state="running"></span><span class="status-text" aria-live="polite">Running</span></p>',
  )
})
