import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { appendManagerFallbackReply } from '../src/manager/history.js'
import { buildFallbackReply } from '../src/manager/loop-helpers.js'
import { loadPromptTemplate } from '../src/prompts/prompt-loader.js'
import { readHistory } from '../src/storage/jsonl.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-fallback-'))

test('buildFallbackReply uses externalized manager fallback template', async () => {
  const expected = (await loadPromptTemplate('manager/fallback-reply.md')).trim()

  const output = await buildFallbackReply({
    inputs: [],
    results: [],
  })

  expect(output).toBe(expected)
})

test('appendManagerFallbackReply writes externalized system fallback text', async () => {
  const expected = (
    await loadPromptTemplate('manager/system-fallback-reply.md')
  ).trim()
  const stateDir = await createTmpDir()
  const paths = buildPaths(stateDir)

  await appendManagerFallbackReply(paths)

  const history = await readHistory(paths.history)
  expect(history.at(-1)?.role).toBe('system')
  expect(history.at(-1)?.text).toBe(expected)
})

test('buildFallbackReply prefers latest input and result over template', async () => {
  await expect(
    buildFallbackReply({
      inputs: [{ id: 'in-1', text: '  latest input  ', createdAt: '2026-02-12T00:00:00.000Z' }],
      results: [{ taskId: 'task-1', status: 'succeeded', ok: true, output: 'result', completedAt: '2026-02-12T00:00:01.000Z' }],
    }),
  ).resolves.toBe('latest input')

  await expect(
    buildFallbackReply({
      inputs: [],
      results: [{ taskId: 'task-1', status: 'succeeded', ok: true, output: '  latest result  ', completedAt: '2026-02-12T00:00:01.000Z' }],
    }),
  ).resolves.toBe('latest result')
})
