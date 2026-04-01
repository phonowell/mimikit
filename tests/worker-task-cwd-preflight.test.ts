import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { ProviderError } from '../src/execution/providers/provider-error.js'
import { assertTaskCwdAvailableForAttempt } from '../src/execution/worker/task-cwd-preflight.js'

test('assertTaskCwdAvailableForAttempt throws preflight error when retry cwd is missing', async () => {
  const cwd = join(process.cwd(), '.tmp-worker-task-cwd-preflight')
  await mkdir(cwd, { recursive: true })
  await rm(cwd, { recursive: true, force: true })

  let caught: unknown
  try {
    assertTaskCwdAvailableForAttempt({
      taskId: 'task-missing-cwd',
      cwd,
      attempt: 2,
      providerId: 'codex-sdk',
    })
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(ProviderError)
  expect((caught as ProviderError).code).toBe('provider_preflight_failed')
  expect((caught as Error).message).toContain(
    'task working directory is missing before retry attempt 2',
  )
  expect((caught as Error).message).toContain(cwd)
})
