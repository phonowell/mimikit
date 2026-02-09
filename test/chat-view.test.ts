import { expect, test } from 'vitest'

import {
  mergeChatMessages,
  selectChatMessages,
} from '../src/orchestrator/read-model/chat-view.js'
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
      role: 'assistant',
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
      role: 'assistant',
      createdAt: '2026-01-01T10:00:05.000Z',
    }),
  ]
  const inflight: UserInput[] = [
    asInput({ id: 'u-2', createdAt: '2026-01-01T10:00:10.000Z' }),
  ]
  const merged = mergeChatMessages({ history, inflightInputs: inflight, limit: 2 })
  expect(merged.map((item) => item.id)).toEqual(['m-1', 'u-2'])
})

test('selectChatMessages returns full payload without afterId', () => {
  const history: HistoryMessage[] = [
    asHistory({
      id: 'u-1',
      role: 'user',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
    asHistory({
      id: 'm-1',
      role: 'assistant',
      createdAt: '2026-01-01T10:00:05.000Z',
    }),
  ]
  const inflight: UserInput[] = []
  const selected = selectChatMessages({
    history,
    inflightInputs: inflight,
    limit: 50,
  })
  expect(selected.mode).toBe('full')
  expect(selected.messages.map((item) => item.id)).toEqual(['u-1', 'm-1'])
})

test('selectChatMessages returns delta payload with valid afterId', () => {
  const history: HistoryMessage[] = [
    asHistory({
      id: 'u-1',
      role: 'user',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
    asHistory({
      id: 'm-1',
      role: 'assistant',
      createdAt: '2026-01-01T10:00:05.000Z',
    }),
  ]
  const inflight: UserInput[] = [
    asInput({ id: 'u-2', createdAt: '2026-01-01T10:00:10.000Z' }),
  ]
  const selected = selectChatMessages({
    history,
    inflightInputs: inflight,
    limit: 50,
    afterId: 'm-1',
  })
  expect(selected.mode).toBe('delta')
  expect(selected.messages.map((item) => item.id)).toEqual(['u-2'])
})

test('selectChatMessages falls back to reset when afterId is missing', () => {
  const history: HistoryMessage[] = [
    asHistory({
      id: 'u-1',
      role: 'user',
      createdAt: '2026-01-01T10:00:00.000Z',
    }),
    asHistory({
      id: 'm-1',
      role: 'assistant',
      createdAt: '2026-01-01T10:00:05.000Z',
    }),
  ]
  const inflight: UserInput[] = []
  const selected = selectChatMessages({
    history,
    inflightInputs: inflight,
    limit: 50,
    afterId: 'unknown-id',
  })
  expect(selected.mode).toBe('reset')
  expect(selected.messages.map((item) => item.id)).toEqual(['u-1', 'm-1'])
})

