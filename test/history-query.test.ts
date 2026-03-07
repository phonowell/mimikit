import { expect, test } from 'vitest'

import { queryHistory } from '../src/history/query.js'
import { pickQueryContextRequest } from '../src/manager/query-context-tool.js'
import type { QueryHistoryRequest } from '../src/history/query.js'

import type { HistoryMessage } from '../src/types/index.js'

test('pickQueryContextRequest accepts query-only payload', () => {
  const request = pickQueryContextRequest([
    {
      name: 'query_context',
      attrs: {
        query: 'roadmap',
      },
    },
  ])

  expect(request).toBeDefined()
  expect(request?.query).toBe('roadmap')
})

test('pickQueryContextRequest rejects legacy attrs', () => {
  const request = pickQueryContextRequest([
    {
      name: 'query_context',
      attrs: {
        query: 'roadmap',
        scopes: 'history',
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

test('queryHistory supports CJK single-char query fallback', () => {
  const request: QueryHistoryRequest = {
    query: '中',
    limit: 5,
    roles: ['user', 'agent'],
  }
  const history: HistoryMessage[] = [
    {
      id: 'm0',
      role: 'user',
      text: '请用中文回复',
      createdAt: '2026-02-08T07:00:00.000Z',
    },
    {
      id: 'm1',
      role: 'agent',
      text: '后续保持简洁',
      createdAt: '2026-02-08T08:00:00.000Z',
    },
  ]

  const lookup = queryHistory(history, request)
  expect(lookup.some((item) => item.id === 'm0')).toBe(true)
})
