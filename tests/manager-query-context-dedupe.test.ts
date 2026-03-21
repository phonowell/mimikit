import { expect, test } from 'vitest'

import { runQueryContextTool } from '../src/manager/query-context-tool.js'
import {
  createQueryContextRuntime,
  requireQueryContextRequest,
} from './helpers/query-context-runtime.js'

test('query_context deduplicates highly similar snippets across all scopes', async () => {
  const runtime = await createQueryContextRuntime()
  runtime.tasks.push({
    id: 'task-dup',
    fingerprint: 'fp-dup',
    prompt: 'deploy service alpha',
    title: 'Duplicated deploy phrase',
    focusId: 'focus-release',
    profile: 'worker',
    status: 'pending',
    createdAt: '2026-03-06T01:20:00.000Z',
  })
  runtime.taskPlans.push({
    id: 'plan-dup',
    title: 'Duplicated deploy phrase plan',
    focusId: 'focus-release',
    priority: 'normal',
    status: 'active',
    trigger: { mode: 'on_worker_slot_freed' },
    effect: {
      kind: 'enqueue_task',
      taskTemplate: {
        title: 'Duplicated deploy phrase plan',
        prompt: 'deploy service alpha',
        cwd: '/tmp',
        contract: {
          goal: 'Deploy service alpha',
          scope: 'Deploy service alpha once',
          acceptance: ['deployment request recorded'],
        },
      },
    },
    createdAt: '2026-03-06T01:10:00.000Z',
    updatedAt: '2026-03-06T01:20:00.000Z',
    runCount: 0,
  })
  runtime.focuses.push({
    id: 'focus-maintenance',
    title: 'Maintenance',
    status: 'idle',
    createdAt: '2026-03-06T01:20:00.000Z',
    updatedAt: '2026-03-06T01:20:00.000Z',
    lastActivityAt: '2026-03-06T01:20:00.000Z',
    summary: 'deploy service alpha',
  })

  const request = requireQueryContextRequest({ query: 'deploy service alpha' })
  const result = await runQueryContextTool({ runtime, request })

  const entries = [
    ...(result.results.history?.items.map((item) => item.snippet) ?? []),
    ...(result.results.tasks?.items.map((item) => item.snippet) ?? []),
    ...(result.results.focus?.items.map((item) => item.summary ?? item.title) ??
      []),
    ...(result.results.plans?.items.map((item) => item.snippet) ?? []),
    ...(result.results.generated_index?.items.map((item) => item.snippet ?? '') ??
      []),
    ...(result.results.task_archives?.items.map((item) => item.snippet ?? '') ??
      []),
  ].map((item) => item.trim().toLowerCase().replace(/\s+/g, ' '))

  const duplicateCount = entries.filter(
    (item) => item === 'deploy service alpha',
  ).length
  expect(duplicateCount).toBeLessThanOrEqual(1)
})
