import { expect, test } from 'vitest'

import {
  applyIncomingFocuses,
  applyIncomingPlans,
  applyIncomingSnapshot,
  createInitialAppState,
  shouldDisplayMessageTime,
} from '../webui-src/lib/messages.js'

test('applyIncomingSnapshot clears awaitingReply when agent message arrives', () => {
  const current = {
    ...createInitialAppState(),
    awaitingReply: true,
    messages: [{ id: 'user-1', role: 'user', text: 'hello' }],
  }

  const { next, newAgentMessages } = applyIncomingSnapshot(current, {
    messages: {
      mode: 'delta',
      messages: [{ id: 'agent-1', role: 'agent', text: 'world' }],
    },
  })

  expect(next.awaitingReply).toBe(false)
  expect(newAgentMessages).toHaveLength(1)
  expect(next.messages.map((message) => message.id)).toEqual([
    'user-1',
    'agent-1',
  ])
})

test('applyIncomingSnapshot clears awaitingReply for manager fallback reply', () => {
  const current = { ...createInitialAppState(), awaitingReply: true }

  const { next } = applyIncomingSnapshot(current, {
    messages: {
      mode: 'full',
      messages: [
        {
          id: 'system-1',
          role: 'system',
          text: 'fallback',
          systemEventName: 'manager_fallback_reply',
        },
      ],
    },
  })

  expect(next.awaitingReply).toBe(false)
})

test('applyIncomingPlans only replaces plans', () => {
  const current = {
    ...createInitialAppState(),
    tasks: [
      {
        id: 'task-1',
        status: 'running',
        title: 'Task',
        createdAt: '2026-03-28T00:00:00.000Z',
        changeAt: '2026-03-28T00:00:00.000Z',
      },
    ],
    focuses: [
      {
        id: 'focus-1',
        title: 'Inbox',
        status: 'active',
        updatedAt: '2026-03-28T00:00:00.000Z',
        lastActivityAt: '2026-03-28T00:00:00.000Z',
      },
    ],
  }

  const next = applyIncomingPlans(current, {
    items: [{ id: 'plan-1', title: 'Split streams' }],
  })

  expect(next.plans).toEqual([{ id: 'plan-1', title: 'Split streams' }])
  expect(next.tasks).toEqual(current.tasks)
  expect(next.focuses).toEqual(current.focuses)
})

test('applyIncomingFocuses only replaces focuses', () => {
  const current = {
    ...createInitialAppState(),
    plans: [{ id: 'plan-1', title: 'Split streams' }],
    tasks: [
      {
        id: 'task-1',
        status: 'running',
        title: 'Task',
        createdAt: '2026-03-28T00:00:00.000Z',
        changeAt: '2026-03-28T00:00:00.000Z',
      },
    ],
  }

  const next = applyIncomingFocuses(current, {
    items: [
      {
        id: 'focus-1',
        title: 'Inbox',
        status: 'active',
        updatedAt: '2026-03-28T00:00:00.000Z',
        lastActivityAt: '2026-03-28T00:00:00.000Z',
      },
    ],
  })

  expect(next.focuses).toEqual([
    {
      id: 'focus-1',
      title: 'Inbox',
      status: 'active',
      updatedAt: '2026-03-28T00:00:00.000Z',
      lastActivityAt: '2026-03-28T00:00:00.000Z',
    },
  ])
  expect(next.tasks).toEqual(current.tasks)
  expect(next.plans).toEqual(current.plans)
})

test('system messages do not display a message time', () => {
  expect(
    shouldDisplayMessageTime({
      role: 'system',
      text: 'status',
    }),
  ).toBe(false)
  expect(
    shouldDisplayMessageTime({
      role: 'user',
      text: 'hello',
    }),
  ).toBe(true)
})
