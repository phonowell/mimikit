import { expect, test } from 'vitest'

import { runQueryContextTool } from '../src/manager/query-context-tool.js'

import {
  createQueryContextRuntime,
  requireQueryContextRequest,
} from './helpers/query-context-runtime.js'

test('query_context supports single history scope', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: 'deploy',
    scopes: 'history',
  })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.history?.items.length).toBeGreaterThan(0)
  const first = result.results.history?.items[0] as { ref?: string } | undefined
  expect(first?.ref).toContain('history:')
})

test('query_context supports multi-scope aggregation', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: '*',
    scopes: 'tasks,focus,plans,memory',
    limit: '3',
  })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.tasks?.items.length).toBeGreaterThan(0)
  expect(result.results.focus?.items.length).toBeGreaterThan(0)
  expect(result.results.plans?.items.length).toBeGreaterThan(0)
  expect(result.results.memory?.items.length).toBeGreaterThan(0)
})

test('query_context enforces limit and byte truncation', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: '*',
    scopes: 'tasks,plans,memory',
    limit_tasks: '1',
    max_bytes: '1024',
  })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.tasks?.items.length).toBeLessThanOrEqual(1)
  expect(result.results.tasks?.truncated).toBe(true)
  expect(result.meta.usedBytes).toBeLessThanOrEqual(result.meta.maxBytes)
})

test('query_context excludes task_archives by default', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({ query: '*' })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.task_archives).toBeUndefined()
})

test('query_context task_archives scope is bounded and path-safe', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: 'deploy',
    scopes: 'task_archives',
    limit_task_archives: '1',
    max_bytes: '2048',
  })
  const result = await runQueryContextTool({ runtime, request })
  const archiveGroup = result.results.task_archives
  expect(archiveGroup).toBeDefined()
  expect((archiveGroup?.items.length ?? 0) <= 2).toBe(true)
  const first = archiveGroup?.items[0] as { archivePath?: string } | undefined
  expect(first?.archivePath?.startsWith('/')).toBe(false)
  expect(archiveGroup?.truncated || result.meta.truncated).toBe(true)
})
