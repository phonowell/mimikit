import { expect, test } from 'vitest'

import {
  mergeChatMessages,
  selectChatMessages,
} from '../src/surface/read-model/chat-view.js'

test('mergeChatMessages keeps visible system text unchanged', () => {
  const messages = mergeChatMessages({
    history: [
      {
        id: 'input-system-1',
        role: 'system',
        visibility: 'user',
        text: '我会安排一个任务继续处理。',
        createdAt: '2026-03-26T10:00:00.000Z',
      },
    ],
    inflightInputs: [],
    limit: 20,
  })

  expect(messages).toEqual([
    expect.objectContaining({
      id: 'input-system-1',
      role: 'system',
      text: '我会安排一个任务继续处理。',
    }),
  ])
})

test('selectChatMessages keeps system event metadata while returning raw text', () => {
  const result = selectChatMessages({
    history: [
      {
        id: 'input-system-2',
        role: 'system',
        visibility: 'user',
        text: '任务完成',
        createdAt: '2026-03-26T10:05:00.000Z',
        systemEventName: 'task_result_available',
        systemEventPayload: {
          taskId: 'task-1',
        },
      },
    ],
    inflightInputs: [],
    limit: 20,
  })

  expect(result.mode).toBe('full')
  expect(result.messages).toEqual([
    expect.objectContaining({
      id: 'input-system-2',
      text: '任务完成',
      systemEventName: 'task_result_available',
      systemEventPayload: {
        taskId: 'task-1',
      },
    }),
  ])
})
