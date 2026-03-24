import { expect, test } from 'vitest'

import { resolveDeleteModeTransition } from '../webui-src/lib/controller-utils.js'

test('entering delete mode clears quote and closes menus', () => {
  const transition = resolveDeleteModeTransition(
    {
      deleteMode: false,
      openTaskMenuId: 'task-1',
      quote: { id: 'msg-1', label: 'User', text: 'hello', role: 'user' },
      toolsMenuOpen: true,
    },
    true,
  )

  expect(transition).toEqual({
    deleteMode: true,
    openTaskMenuId: '',
    quote: null,
    toolsMenuOpen: false,
    focusTargetId: 'delete-mode-exit-btn',
  })
})

test('exiting delete mode restores composer focus target', () => {
  const transition = resolveDeleteModeTransition(
    {
      deleteMode: true,
      openTaskMenuId: '',
      quote: null,
      toolsMenuOpen: false,
    },
    false,
  )

  expect(transition.deleteMode).toBe(false)
  expect(transition.focusTargetId).toBe('message-input')
})
