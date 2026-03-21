import { describe, expect, test, vi } from 'vitest'

import { createRestartStateController } from '../webui/restart-state-controller.js'

const createControl = () => {
  let title = ''
  return {
    disabled: false,
    getAttribute: (name: string) => (name === 'title' ? title : null),
    setAttribute: (name: string, value: string) => {
      if (name === 'title') title = value
    },
    removeAttribute: (name: string) => {
      if (name === 'title') title = ''
    },
  }
}

describe('createRestartStateController', () => {
  test('keeps restart controls enabled when local idle state is stale', () => {
    const controls = {
      toolsRestartBtn: createControl(),
      toolsResetBtn: createControl(),
      toolsToggleBtn: createControl(),
      restartCancelBtn: createControl(),
      restartConfirmBtn: createControl(),
      resetCancelBtn: createControl(),
      resetConfirmBtn: createControl(),
    }
    const controller = createRestartStateController({
      controls,
      messages: {
        isFullyIdle: () => false,
      },
      toolsMenuController: {
        setDisabled: vi.fn(),
      },
      closeDialogs: vi.fn(),
    })

    expect(controller.refreshUiIdleState()).toBe(false)
    expect(controls.toolsRestartBtn.disabled).toBe(false)
    expect(controls.toolsResetBtn.disabled).toBe(false)
    expect(controls.restartConfirmBtn.disabled).toBe(false)
    expect(controls.resetConfirmBtn.disabled).toBe(false)
  })
})
