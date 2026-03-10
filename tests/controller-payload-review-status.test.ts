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

test('payload controller forwards review status from tasks events', () => {
  const loading = createLoading()
  const onTasksSnapshot = vi.fn()
  const onReviewStatusSnapshot = vi.fn()
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
    onReviewStatusSnapshot,
  })

  controller.applyTasksSnapshot({
    tasks: {
      tasks: [{ id: 'task-1', status: 'paused' }],
      counts: { paused: 1 },
    },
    reviewStatus: {
      cards: [{ id: 'recoverable', label: 'Need resume', value: 1 }],
      highlights: [],
    },
  })

  expect(onTasksSnapshot).toHaveBeenCalledWith({
    tasks: [{ id: 'task-1', status: 'paused' }],
    counts: { paused: 1 },
  })
  expect(onReviewStatusSnapshot).toHaveBeenCalledWith({
    cards: [{ id: 'recoverable', label: 'Need resume', value: 1 }],
    highlights: [],
  })
  expect(updateStatus).not.toHaveBeenCalled()
  expect(doRender).not.toHaveBeenCalled()
})

test('payload controller forwards review status from full snapshots', () => {
  const loading = createLoading()
  const onTasksSnapshot = vi.fn()
  const onReviewStatusSnapshot = vi.fn()
  const updateStatus = vi.fn()
  const syncLoadingState = vi.fn()
  const controller = createPayloadController({
    messageState: createMessageState(),
    loading,
    doRender: vi.fn(() => false),
    syncLoadingState,
    updateStatus,
    onTasksSnapshot,
    onReviewStatusSnapshot,
  })

  controller.applySnapshot({
    status: { ok: true },
    messages: { messages: [], mode: 'full' },
    tasks: { tasks: [], counts: {} },
    reviewStatus: {
      cards: [{ id: 'done', label: 'Done', value: 2 }],
      highlights: [{ id: 'h-1', title: 'Needs review', detail: 'Task resumed.' }],
    },
    plans: { items: [] },
    focuses: { items: [] },
    choice: null,
  })

  expect(updateStatus).toHaveBeenCalledWith({ ok: true })
  expect(onTasksSnapshot).toHaveBeenCalledWith({ tasks: [], counts: {} })
  expect(onReviewStatusSnapshot).toHaveBeenCalledWith({
    cards: [{ id: 'done', label: 'Done', value: 2 }],
    highlights: [{ id: 'h-1', title: 'Needs review', detail: 'Task resumed.' }],
  })
})
