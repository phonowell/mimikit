import { expect, test } from 'vitest'

import {
  pickQueryHistoryRequest,
  queryHistory,
} from '../src/history/query.js'
import type { QueryHistoryRequest } from '../src/history/query.js'

import type { HistoryMessage } from '../src/types/index.js'

test('pickQueryHistoryRequest expands roles=all', () => {
  const request = pickQueryHistoryRequest([
    {
      name: 'query_history',
      attrs: {
        query: 'roadmap',
        limit: '10',
        roles: 'all',
      },
    },
  ])

  expect(request).toBeDefined()
  expect(request?.roles).toEqual(['user', 'agent', 'system'])
})

test('pickQueryHistoryRequest rejects invalid limit format', () => {
  const request = pickQueryHistoryRequest([
    {
      name: 'query_history',
      attrs: {
        query: 'roadmap',
        limit: '1e2',
      },
    },
  ])

  expect(request).toBeUndefined()
})

test('queryHistory applies before_id window filter', () => {
  const request: QueryHistoryRequest = {
    query: 'roadmap',
    limit: 10,
    roles: ['user', 'agent'],
    beforeId: 'm5',
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
      text: 'roadmap draft before cutoff',
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
      text: 'roadmap now tracks before-id window',
      createdAt: '2026-02-09T09:00:00.000Z',
    },
    {
      id: 'm4',
      role: 'agent',
      text: 'roadmap done before cutoff',
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
  expect(lookup).toHaveLength(5)
  const ids = lookup.map((item) => item.id)
  expect(new Set(ids)).toEqual(new Set(['m0', 'm1', 'm2', 'm3', 'm4']))
})
