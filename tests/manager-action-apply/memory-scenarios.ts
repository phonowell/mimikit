import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { readHistory } from '../../src/persistence/history/store.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { resolveProjectProfilePath } from '../../src/work/project-profile/store.js'

import { createRuntime } from './testkit.js'

test('remember_memory writes MEMORY.md immediately and emits system event payload', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      type: 'remember_memory',
      content: 'User insists on always using strict ESM imports.',
      source_input_id: 'input-user',
      source_quote: 'always using strict ESM imports',
    },
  ])

  const memoryMarkdown = await readFile(runtime.paths.memoryFile, 'utf8')
  expect(memoryMarkdown).toContain('## [memory-entry] (id:')
  expect(memoryMarkdown).toContain(
    'User insists on always using strict ESM imports.',
  )

  const history = await readHistory(runtime.paths.history)
  const event = history.find(
    (item) =>
      item.role === 'system' &&
      item.systemEventName === 'memory_remembered',
  )
  expect(event).toBeTruthy()
  expect(event?.systemEventPayload?.operation).toBe('created')
  expect(typeof event?.systemEventPayload?.entry_id).toBe('string')
})

test('remember_project_profile writes repo-bound project profile immediately', async () => {
  const runtime = await createRuntime()
  runtime.startup = {
    startedAt: '2026-03-27T08:00:00.000Z',
    worktree: '/repo/mimikit',
  }

  await applyTaskActions(runtime, [
    {
      type: 'remember_project_profile',
      content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
      source_input_id: 'input-user',
      source_quote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
    },
  ])

  const projectProfileMarkdown = await readFile(
    resolveProjectProfilePath(runtime.config.workDir, runtime.startup.worktree),
    'utf8',
  )
  expect(projectProfileMarkdown).toContain('## [project-profile-entry] (id:')
  expect(projectProfileMarkdown).toContain(
    '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
  )
  expect(projectProfileMarkdown).toContain(
    'source_quote: 后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
  )

  const history = await readHistory(runtime.paths.history)
  const event = history.find(
    (item) =>
      item.role === 'system' &&
      item.systemEventName === 'project_profile_remembered',
  )
  expect(event).toBeTruthy()
  expect(event?.systemEventPayload?.operation).toBe('created')
  expect(typeof event?.systemEventPayload?.entry_id).toBe('string')
})
