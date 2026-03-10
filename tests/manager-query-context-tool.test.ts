import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import { pickQueryContextRequest, runQueryContextTool } from '../src/manager/query-context-tool.js'
import { QUERY_CONTEXT_GENERATED_WALK_MAX_FILES as GENERATED_WALK_MAX_FILES } from '../src/manager/query-context-params.js'
import { createQueryContextRuntime, requireQueryContextRequest } from './helpers/query-context-runtime.js'

test('query_context supports single history scope', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: 'deploy',
  })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.history?.items.length).toBeGreaterThan(0)
  const first = result.results.history?.items[0] as { ref?: string } | undefined
  expect(first?.ref).toContain('history:')
})

test('query_context aggregates all scopes by default', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: '*',
  })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.tasks?.items.length).toBeGreaterThan(0)
  expect(result.results.focus?.items.length).toBeGreaterThan(0)
  expect(result.results.plans?.items.length).toBeGreaterThan(0)
  expect(result.results.generated_index?.items.length).toBeGreaterThan(0)
  expect(result.results.task_archives).toBeDefined()
})

test('query_context enforces limit and byte truncation', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({
    query: '*',
  })
  const result = await runQueryContextTool({ runtime, request })
  expect(result.results.tasks?.items.length).toBeLessThanOrEqual(12)
  expect(result.results.tasks?.truncated).toBe(false)
  expect(result.meta.usedBytes).toBeLessThanOrEqual(result.meta.maxBytes)
})

test('query_context rejects legacy attrs and keeps strict query-only contract', () => {
  const request = pickQueryContextRequest([
    {
      name: 'query_context',
      attrs: {
        query: '*',
        limit: '10',
      },
    },
  ])
  expect(request).toBeUndefined()
})

test('query_context task_archives scope is bounded and path-safe', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({ query: 'deploy' })
  const result = await runQueryContextTool({ runtime, request })
  const archiveGroup = result.results.task_archives
  expect(archiveGroup).toBeDefined()
  expect((archiveGroup?.items.length ?? 0) <= 12).toBe(true)
  const first = archiveGroup?.items[0] as { archivePath?: string } | undefined
  expect(first?.archivePath?.startsWith('/')).toBe(false)
  expect(result.meta.usedBytes).toBeLessThanOrEqual(result.meta.maxBytes)
})

test('query_context generated_index scope is bounded and path-safe', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({ query: 'deploy' })
  const result = await runQueryContextTool({ runtime, request })
  const group = result.results.generated_index
  expect(group).toBeDefined()
  expect((group?.items.length ?? 0) <= 6).toBe(true)
  const first = group?.items[0] as { path?: string; ref?: string } | undefined
  expect(first?.path?.startsWith('/')).toBe(false)
  expect(first?.path?.startsWith('..')).toBe(false)
  expect(first?.ref?.startsWith('generated:')).toBe(true)
})

test('query_context generated_index excludes non-utf8 files', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({ query: '*' })
  const result = await runQueryContextTool({ runtime, request })
  const paths = (
    result.results.generated_index?.items.map((item) => item.path) ?? []
  ).map((item) => item.trim())
  expect(paths).not.toContain('generated/binary.dat')
})

test('query_context generated_index includes both repo and state generated roots', async () => {
  const runtime = await createQueryContextRuntime()
  const request = requireQueryContextRequest({ query: 'resume deploy' })
  const result = await runQueryContextTool({ runtime, request })
  const paths = result.results.generated_index?.items.map((item) => item.path) ?? []

  expect(paths).toContain('.mimikit/generated/handoff.md')
})

test('query_context generated_index keeps newer repo files when state generated is crowded', async () => {
  const runtime = await createQueryContextRuntime()
  const stateFloodDir = join(runtime.paths.root, '.mimikit', 'generated', 'flood')
  const oldTime = new Date('2026-03-01T00:00:00.000Z')
  const newTime = new Date('2026-03-09T00:00:00.000Z')

  await mkdir(stateFloodDir, { recursive: true })
  for (let index = 0; index <= GENERATED_WALK_MAX_FILES; index += 1) {
    const filePath = join(stateFloodDir, `snapshot-${index}.md`)
    await writeFile(filePath, `snapshot ${index} without keyword`, 'utf8')
    await utimes(filePath, oldTime, oldTime)
  }

  await utimes(
    join(runtime.paths.root, '.mimikit', 'generated', 'handoff.md'),
    oldTime,
    oldTime,
  )
  await utimes(
    join(runtime.paths.root, 'generated', 'deploy-notes.md'),
    newTime,
    newTime,
  )

  const request = requireQueryContextRequest({ query: 'canary' })
  const result = await runQueryContextTool({ runtime, request })
  const paths = result.results.generated_index?.items.map((item) => item.path) ?? []

  expect(paths).toContain('generated/deploy-notes.md')
})

test('query_context keeps repo and state generated paths distinct in .mimikit mode', async () => {
  const runtime = await createQueryContextRuntime({ useStateDir: true })
  const request = requireQueryContextRequest({ query: 'deploy' })
  const result = await runQueryContextTool({ runtime, request })
  const paths = result.results.generated_index?.items.map((item) => item.path) ?? []

  expect(paths).toContain('generated/deploy-notes.md')
  expect(paths).toContain('.mimikit/generated/handoff.md')
})

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
    prompt: 'deploy service alpha',
    title: 'Duplicated deploy phrase plan',
    focusId: 'focus-release',
    profile: 'worker',
    priority: 'normal',
    source: 'user_request',
    status: 'active',
    trigger: { mode: 'on_worker_slot_freed' },
    createdAt: '2026-03-06T01:10:00.000Z',
    updatedAt: '2026-03-06T01:20:00.000Z',
    runCount: 0,
  })
  runtime.focusDigests.push({
    focusId: 'focus-maintenance',
    summary: 'deploy service alpha',
    updatedAt: '2026-03-06T01:20:00.000Z',
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
