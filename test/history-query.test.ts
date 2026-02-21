import { expect, test } from 'vitest'

import {
  pickQueryHistoryRequest,
  queryHistory,
} from '../src/manager/history-query.js'
import type { QueryHistoryRequest } from '../src/manager/history-query-request.js'

import type { HistoryMessage } from '../src/types/index.js'

test('pickQueryHistoryRequest normalizes inverted from/to range', () => {
  const request = pickQueryHistoryRequest([
    {
      name: 'query_history',
      attrs: {
        query: 'roadmap',
        limit: '10',
        roles: 'user,agent',
        from: '2026-02-09T23:59:59.999Z',
        to: '2026-02-08T00:00:00.000Z',
        before_id: 'm5',
      },
    },
  ])

  expect(request).toBeDefined()
  expect(request?.fromMs).toBeLessThanOrEqual(request?.toMs ?? Number.MAX_SAFE_INTEGER)
  expect(request?.beforeId).toBe('m5')
})

test('queryHistory applies before_id window and time range filters', () => {
  const request: QueryHistoryRequest = {
    query: 'roadmap',
    limit: 10,
    roles: ['user', 'agent'],
    beforeId: 'm5',
    fromMs: Date.parse('2026-02-08T00:00:00.000Z'),
    toMs: Date.parse('2026-02-09T23:59:59.999Z'),
  }
  const history: HistoryMessage[] = [
    {
      id: 'm0',
      role: 'user',
      text: 'roadmap kickoff and scope',
      createdAt: '2026-02-08T07:00:00.000Z',
    },
    {
      id: 'm1',
      role: 'user',
      text: 'roadmap draft in early window',
      createdAt: '2026-02-07T12:00:00.000Z',
    },
    {
      id: 'm2',
      role: 'agent',
      text: 'roadmap includes API and docs',
      createdAt: '2026-02-08T09:00:00.000Z',
    },
    {
      id: 'm3',
      role: 'user',
      text: 'roadmap now tracks history range',
      createdAt: '2026-02-09T09:00:00.000Z',
    },
    {
      id: 'm4',
      role: 'agent',
      text: 'roadmap done for this sprint',
      createdAt: '2026-02-10T09:00:00.000Z',
    },
    {
      id: 'm5',
      role: 'agent',
      text: 'roadmap after window',
      createdAt: '2026-02-11T09:00:00.000Z',
    },
  ]

  const lookup = queryHistory(history, request)
  expect(lookup).toHaveLength(3)
  const ids = lookup.map((item) => item.id)
  expect(new Set(ids)).toEqual(new Set(['m0', 'm2', 'm3']))
})
