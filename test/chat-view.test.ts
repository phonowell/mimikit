import { expect, test } from 'vitest'

import { mergeChatMessages } from '../src/supervisor/chat-view.js'
import type { HistoryMessage, UserInput } from '../src/types/index.js'

const asHistory = (params: {
  id: string
  role: HistoryMessage['role']
  text?: string
  createdAt: string
}): HistoryMessage => ({
  id: params.id,
  role: params.role,
  text: params.text ?? params.id,
  createdAt: params.createdAt,
})

const asInput = (params: {
  id: string
  text?: string
  createdAt: string
}): UserInput => ({
  id: params.id,
  text: params.text ?? params.id,
  createdAt: params.createdAt,
})

test('mergeChatMessages includes inflight input as unread', () => {
  const history: HistoryMessage[] = [
    asHistory({
      id: 'u-1',
      role: 'user',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
    asHistory({
      id: 'm-1',
      role: 'manager',
      createdAt: '2026-01-01T10:00:05.000Z',
    }),
  ]
  const inflight: UserInput[] = [
    asInput({ id: 'u-2', createdAt: '2026-01-01T10:00:10.000Z' }),
  ]
  const merged = mergeChatMessages({ history, inflightInputs: inflight, limit: 20 })
  expect(merged.map((item) => item.id)).toEqual(['u-1', 'm-1', 'u-2'])
  expect(merged.find((item) => item.id === 'u-1')?.role).toBe('user')
  expect(merged.find((item) => item.id === 'u-2')?.role).toBe('user')
})

test('mergeChatMessages keeps persisted user message only once', () => {
  const history: HistoryMessage[] = [
    asHistory({
      id: 'u-1',
      role: 'user',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
  ]
  const inflight: UserInput[] = [
    asInput({ id: 'u-1', createdAt: '2026-01-01T10:00:00.000Z' }),
  ]
  const merged = mergeChatMessages({ history, inflightInputs: inflight, limit: 20 })
  expect(merged).toHaveLength(1)
  expect(merged[0]?.id).toBe('u-1')
})

test('mergeChatMessages applies limit from the tail', () => {
  const history: HistoryMessage[] = [
    asHistory({
      id: 'u-1',
      role: 'user',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
    asHistory({
      id: 'm-1',
      role: 'manager',
      createdAt: '2026-01-01T10:00:05.000Z',
    }),
  ]
  const inflight: UserInput[] = [
    asInput({ id: 'u-2', createdAt: '2026-01-01T10:00:10.000Z' }),
  ]
  const merged = mergeChatMessages({ history, inflightInputs: inflight, limit: 2 })
  expect(merged.map((item) => item.id)).toEqual(['m-1', 'u-2'])
})
