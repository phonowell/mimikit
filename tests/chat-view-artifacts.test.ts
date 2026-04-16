import { expect, test } from 'vitest'

import {
  mergeChatMessages,
  selectChatMessages,
} from '../src/surface/read-model/chat-view.js'

test('mergeChatMessages enriches agent messages with structured local artifacts from text', () => {
  const messages = mergeChatMessages({
    history: [
      {
        id: 'agent-artifact-1',
        role: 'agent',
        text: '任务归档：.mimikit/tasks/任务.md',
        createdAt: '2026-03-26T10:06:00.000Z',
        focusId: 'focus-1',
      },
    ],
    inflightInputs: [],
    limit: 20,
  })

  expect(messages).toEqual([
    expect.objectContaining({
      id: 'agent-artifact-1',
      artifacts: [
        {
          href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F%25E4%25BB%25BB%25E5%258A%25A1.md',
          label: '.mimikit/tasks/任务.md',
          path: '.mimikit/tasks/任务.md',
        },
      ],
    }),
  ])
})

test('mergeChatMessages preserves explicit artifacts instead of reparsing agent text', () => {
  const messages = mergeChatMessages({
    history: [
      {
        id: 'agent-artifact-2',
        role: 'agent',
        text: '请看“计划/报告.md”。',
        createdAt: '2026-03-26T10:06:30.000Z',
        focusId: 'focus-1',
        artifacts: [
          {
            href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-2.md',
            label: '.mimikit/tasks/task-2.md',
            path: '.mimikit/tasks/task-2.md',
            kind: 'task_archive',
            note: '任务归档',
          },
        ],
      },
    ],
    inflightInputs: [],
    limit: 20,
  })

  expect(messages).toEqual([
    expect.objectContaining({
      id: 'agent-artifact-2',
      artifacts: [
        {
          href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-2.md',
          kind: 'task_archive',
          label: '.mimikit/tasks/task-2.md',
          note: '任务归档',
          path: '.mimikit/tasks/task-2.md',
        },
      ],
    }),
  ])
})

test('selectChatMessages projects structured artifacts from system event payload', () => {
  const result = selectChatMessages({
    history: [
      {
        id: 'input-system-3',
        role: 'system',
        visibility: 'user',
        text: '任务完成',
        createdAt: '2026-03-26T10:07:00.000Z',
        focusId: 'focus-1',
        systemEventName: 'task_completed',
        systemEventPayload: {
          taskId: 'task-1',
          artifacts: [
            {
              path: '.mimikit/tasks/task-1.md',
              kind: 'task_archive',
              note: '任务归档',
            },
          ],
        },
      },
    ],
    inflightInputs: [],
    limit: 20,
  })

  expect(result.messages).toEqual([
    expect.objectContaining({
      id: 'input-system-3',
      artifacts: [
        {
          href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-1.md',
          kind: 'task_archive',
          label: '.mimikit/tasks/task-1.md',
          note: '任务归档',
          path: '.mimikit/tasks/task-1.md',
        },
      ],
    }),
  ])
})

test('selectChatMessages prefers explicit system artifacts over payload fallback parsing', () => {
  const result = selectChatMessages({
    history: [
      {
        id: 'input-system-4',
        role: 'system',
        visibility: 'user',
        text: '任务归档：.mimikit/tasks/旧任务.md',
        createdAt: '2026-03-26T10:08:00.000Z',
        focusId: 'focus-1',
        systemEventName: 'task_completed',
        systemEventPayload: {
          taskId: 'task-2',
          artifacts: [
            {
              path: '.mimikit/tasks/task-2.md',
              kind: 'task_archive',
              note: '任务归档',
            },
          ],
        },
        artifacts: [
          {
            href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-2.md',
            label: '.mimikit/tasks/task-2.md',
            path: '.mimikit/tasks/task-2.md',
            kind: 'task_archive',
            note: '任务归档',
          },
        ],
      },
    ],
    inflightInputs: [],
    limit: 20,
  })

  expect(result.messages).toEqual([
    expect.objectContaining({
      id: 'input-system-4',
      artifacts: [
        {
          href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-2.md',
          kind: 'task_archive',
          label: '.mimikit/tasks/task-2.md',
          note: '任务归档',
          path: '.mimikit/tasks/task-2.md',
        },
      ],
    }),
  ])
})
