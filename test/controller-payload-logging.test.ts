import { expect, test, vi } from 'vitest'

import { createPayloadController } from '../webui/messages/controller-payload.js'
import { createMessageState } from '../webui/messages/state.js'

const createLoadingStub = () => ({
  isLoading: () => false,
})

const createController = () =>
  createPayloadController({
    messageState: createMessageState(),
    loading: createLoadingStub(),
    doRender: () => null,
    syncLoadingState: () => {},
    updateStatus: () => {},
    onTasksSnapshot: () => {},
    onPlansSnapshot: () => {},
    onFocusesSnapshot: () => {},
    onChoiceSnapshot: () => {},
  })

test('payload controller logs role/type/source/visibility/summary for ingress messages', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const controller = createController()
    const payload = {
      mode: 'full',
      messages: [
        {
          id: 'input-1',
          role: 'user',
          text: 'Please summarize the latest task status',
          createdAt: '2026-03-06T00:00:00.000Z',
          focusId: 'focus-global',
        },
        {
          id: 'sys-1',
          role: 'system',
          visibility: 'all',
          text: 'Selected option "Report".\n\n<M:system_event name="user_choice" version="1">{"source":"timeout"}</M:system_event>',
          createdAt: '2026-03-06T00:00:01.000Z',
          focusId: 'focus-global',
        },
      ],
    }

    controller.applyMessagesPayload(payload)
    controller.applyMessagesPayload(payload)

    const messageLogs = infoSpy.mock.calls.filter(
      (call) => call[0] === '[webui] session ingress message',
    )
    expect(messageLogs).toHaveLength(2)
    expect(messageLogs[0]?.[1]).toMatchObject({
      role: 'user',
      type: 'user_message',
      source: 'unknown',
      visibility: 'all',
      summary: 'Please summarize the latest task status',
    })
    expect(messageLogs[1]?.[1]).toMatchObject({
      role: 'system',
      type: 'system_event:user_choice',
      source: 'timeout',
      visibility: 'all',
      summary: 'Selected option "Report".',
    })
  } finally {
    infoSpy.mockRestore()
  }
})

test('payload controller re-logs a message when the same id carries a new summary', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const controller = createController()
    controller.applyMessagesPayload({
      mode: 'full',
      messages: [
        {
          id: 'agent-1',
          role: 'agent',
          text: 'Draft v1',
          createdAt: '2026-03-06T00:00:00.000Z',
          focusId: 'focus-global',
        },
      ],
    })
    controller.applyMessagesPayload({
      mode: 'full',
      messages: [
        {
          id: 'agent-1',
          role: 'agent',
          text: 'Draft v2',
          createdAt: '2026-03-06T00:00:01.000Z',
          focusId: 'focus-global',
        },
      ],
    })

    const messageLogs = infoSpy.mock.calls.filter(
      (call) => call[0] === '[webui] session ingress message',
    )
    expect(messageLogs).toHaveLength(2)
    expect(messageLogs[0]?.[1]).toMatchObject({ summary: 'Draft v1' })
    expect(messageLogs[1]?.[1]).toMatchObject({ summary: 'Draft v2' })
  } finally {
    infoSpy.mockRestore()
  }
})
