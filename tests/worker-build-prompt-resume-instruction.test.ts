import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { buildWorkerPrompt } from '../src/execution/prompts/build-worker-prompt.js'
import { persistTaskExecutionSpec } from '../src/work/spec/store.js'

import type { Task } from '../src/foundation/types/index.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-prompt-'))
  tempDirs.push(dir)
  return dir
}

const createTask = (id: string, overrides?: Partial<Task>): Task => ({
  id,
  fingerprint: `fp-${id}`,
  semanticKey: `sk-${id}`,
  executionSpecId: `spec-${id}`,
  title: '修复测试',
  cwd: '/tmp/worker-prompt',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('buildWorkerPrompt includes resume instruction block when provided', async () => {
  const stateDir = await createTmpDir()
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '修复当前测试失败。',
    specId: 'spec-task-build-worker-prompt',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt'),
    resumeInstruction: '继续当前任务，但先确认工作区已有改动是否需要保留。',
  })

  expect(prompt).toContain('<M:resume_instruction>')
  expect(prompt).toContain('继续当前任务，但先确认工作区已有改动是否需要保留。')
})

test('buildWorkerPrompt anchors worker around execution contract and compressed handoff', async () => {
  const stateDir = await createTmpDir()
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '修复当前测试失败。',
    specId: 'spec-task-build-worker-prompt-priority',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt-priority'),
    focusBrief: {
      focusId: 'focus-inbox',
      title: 'focus-inbox',
      summary: '之前的任务已完成。',
      updatedAt: '2026-03-06T00:00:00.000Z',
      lastActivityAt: '2026-03-06T00:00:00.000Z',
    },
    resumeInstruction: '继续当前任务，但先核对工作区已有改动。',
  })

  expect(prompt).toContain('你是 MIMIKIT 的执行面')
  expect(prompt).toContain(
    '输入优先级：任务合同 > 工作区现状与证据 > 一次性恢复补充 > focus 摘要',
  )
  expect(prompt).toContain('先读取完整任务说明，再开始执行')
  expect(prompt).toContain('`focus_brief` 仅作背景摘要')
  expect(prompt).toContain('`resume_instruction` 只影响本次恢复策略')
  expect(prompt).toContain(
    '最终只回传结论、验证、风险、证据路径与必要 artifact',
  )
  expect(prompt).not.toContain('currently undergoing chemotherapy')
  expect(prompt).not.toContain('You are a lifeline')
  expect(prompt).not.toContain('top 0.1% of engineers')
})

test('buildWorkerPrompt narrows default evidence collection to current task scope', async () => {
  const stateDir = await createTmpDir()
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '重跑当前调研任务。',
    specId: 'spec-task-build-worker-prompt-evidence-boundary',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt-evidence-boundary'),
  })

  expect(prompt).toContain('默认先检查当前 task 明确引用的证据')
  expect(prompt).toContain(
    '不要默认枚举整个 `.mimikit/tasks`、`.mimikit/results`、`.mimikit/history`',
  )
  expect(prompt).toContain('若任务是“重跑 / 复盘 / 续跑”')
})

test('buildWorkerPrompt exposes read-only runtime contract to the worker', async () => {
  const stateDir = await createTmpDir()
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '只读检查当前仓库状态。',
    specId: 'spec-task-build-worker-prompt-runtime-read',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit',
    task: createTask('task-build-worker-prompt-runtime-read', {
      resourceMode: 'read',
    }),
  })

  expect(prompt).toContain('<M:runtime_contract>')
  expect(prompt).toContain('resource_mode: read')
  expect(prompt).toContain('write_policy: forbidden')
  expect(prompt).toContain('working_directory: /repo/mimikit')
})

test('buildWorkerPrompt exposes worktree runtime contract to the worker', async () => {
  const stateDir = await createTmpDir()
  await persistTaskExecutionSpec({
    stateDir,
    prompt: '在隔离 worktree 中完成最小改动。',
    specId: 'spec-task-build-worker-prompt-runtime-worktree',
  })
  const prompt = await buildWorkerPrompt({
    stateDir,
    workspaceDir: '/repo/mimikit/.worktrees/task-runtime-contract',
    task: createTask('task-build-worker-prompt-runtime-worktree', {
      resourceMode: 'write',
      cwd: '/repo/mimikit/.worktrees/task-runtime-contract/src',
      repoKey: '/repo/mimikit/.git',
      branch: 'task/runtime-contract',
      git: {
        worktreePath: '/repo/mimikit/.worktrees/task-runtime-contract',
        branch: 'task/runtime-contract',
        closureRequired: true,
      },
    }),
  })

  expect(prompt).toContain('<M:runtime_contract>')
  expect(prompt).toContain('resource_mode: write')
  expect(prompt).toContain('write_policy: allowed_within_work_dir')
  expect(prompt).toContain(
    'working_directory: /repo/mimikit/.worktrees/task-runtime-contract',
  )
  expect(prompt).toContain(
    'task_cwd: /repo/mimikit/.worktrees/task-runtime-contract/src',
  )
  expect(prompt).toContain(
    'worktree_root: /repo/mimikit/.worktrees/task-runtime-contract',
  )
  expect(prompt).toContain('branch: task/runtime-contract')
})
