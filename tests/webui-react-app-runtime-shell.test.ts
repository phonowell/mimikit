import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { AppRuntimeShell } from '../webui-src/app-runtime/AppRuntime.js'

const noop = (): void => undefined

test('app runtime shell renders the top-level surfaces directly and swaps composer for delete-mode exit', () => {
  Object.assign(globalThis, { React })
  const markup = renderToStaticMarkup(
    React.createElement(AppRuntimeShell, {
      headerSurface: {
        statusText: 'Idle',
        statusState: 'idle',
        workerStates: ['idle'],
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
      },
      messageListSurface: {
        messages: [],
        loading: false,
        deleteMode: true,
        listRef: React.createRef<HTMLUListElement>(),
        scrollButtonVisible: false,
        onScrollBottom: noop,
        onQuote: noop,
        onDelete: noop,
      },
      composerSurface: {
        deleteMode: true,
        value: '',
        sendPending: false,
        quote: null,
        isNearBottom: true,
        onChange: noop,
        onClearQuote: noop,
        onLayoutShift: noop,
        onSubmit: noop,
        onExitDeleteMode: noop,
      },
      tasksDialogSurface: {
        open: false,
        tasks: [],
        openMenuId: '',
        onClose: noop,
        onToggleMenu: noop,
        onTaskAction: noop,
        onRequestDelete: noop,
      },
      plansDialogSurface: {
        open: false,
        openMenuId: '',
        plans: [],
        onClose: noop,
        onPlanAction: noop,
        onToggleMenu: noop,
      },
      confirmDialogsSurface: {
        dialog: null,
        busy: false,
        onClose: noop,
        onConfirm: noop,
      },
    }),
  )

  expect(markup).toContain('aria-label="Plans"')
  expect(markup).toContain('aria-label="Tasks"')
  expect(markup).toContain('delete-mode-exit-btn')
  expect(markup).not.toContain('message-input')
})
