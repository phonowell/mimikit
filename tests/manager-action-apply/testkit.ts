import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'
import type { ManagerTaskDraft } from '../../src/policy/manager/manager-turn-schema.js'

export const TASK_CWD = join(tmpdir(), 'manager-action-apply-task')

export const TASK_DRAFT_BASE: ManagerTaskDraft = {
  title: 'manager action task',
  cwd: TASK_CWD,
  mode: 'write' as const,
  use_worktree: false,
  goal: 'Deliver requested outcome',
  in_scope: ['Single runnable worker task'],
  out_of_scope: [],
  done_when: ['Return concrete output'],
  context_refs: [],
  instructions: [],
}

export const buildTaskDraft = (
  overrides: Partial<ManagerTaskDraft> = {},
): ManagerTaskDraft => ({
  ...TASK_DRAFT_BASE,
  ...overrides,
})

export const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  await mkdir(TASK_CWD, { recursive: true })
  return runtime
}
