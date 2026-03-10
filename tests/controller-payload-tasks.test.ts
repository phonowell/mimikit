import { expect, test, vi } from 'vitest'

import { createPayloadController } from '../webui/messages/controller-payload.js'
import { createMessageState } from '../webui/messages/state.js'

const createLoading = () => {
  let loading = false
  return {
    isLoading: () => loading,
    setLoading: vi.fn((value: boolean) => {
      loading = value
    }),
  }
}

test('payload controller forwards task snapshots from tasks events', () => {
  const loading = createLoading()
  const onTasksSnapshot = vi.fn()
  const updateStatus = vi.fn()
  const syncLoadingState = vi.fn()
  const doRender = vi.fn(() => false)
  const controller = createPayloadController({
    messageState: createMessageState(),
    loading,
    doRender,
    syncLoadingState,
    updateStatus,
    onTasksSnapshot,
  })

  controller.applyTasksSnapshot({
    tasks: [{ id: 'task-1', status: 'paused' }],
    counts: { paused: 1 },
  })

  expect(onTasksSnapshot).toHaveBeenCalledWith({
    tasks: [{ id: 'task-1', status: 'paused' }],
    counts: { paused: 1 },
  })
  expect(updateStatus).not.toHaveBeenCalled()
  expect(doRender).not.toHaveBeenCalled()
})

test('payload controller forwards task snapshots from full snapshots', () => {
  const loading = createLoading()
  const onTasksSnapshot = vi.fn()
  const updateStatus = vi.fn()
  const syncLoadingState = vi.fn()
  const controller = createPayloadController({
    messageState: createMessageState(),
    loading,
    doRender: vi.fn(() => false),
    syncLoadingState,
    updateStatus,
    onTasksSnapshot,
  })

  controller.applySnapshot({
    status: { ok: true },
    messages: { messages: [], mode: 'full' },
    tasks: { tasks: [], counts: {} },
    plans: { items: [] },
    focuses: { items: [] },
    choices: [],
  })

  expect(updateStatus).toHaveBeenCalledWith({ ok: true })
  expect(onTasksSnapshot).toHaveBeenCalledWith({ tasks: [], counts: {} })
})
