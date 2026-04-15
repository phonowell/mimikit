import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { Header } from '../webui-src/components/Header.js'

globalThis.React = React
const noop = () => undefined

test('Header keeps status summary without rendering the status-copy wrapper', () => {
  const markup = renderToStaticMarkup(
    React.createElement(Header, {
      statusText: 'Running',
      statusState: 'running',
      qualitySummary: '2 plans active',
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
    }),
  )

  expect(markup).toContain('Running')
  expect(markup).toContain('2 plans active')
  expect(markup).not.toContain('status-copy')
})
