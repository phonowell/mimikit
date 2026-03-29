import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPayload } from '../src/policy/prompts/build-prompts.js'
import {
  resolveProjectProfilePath,
  writeProjectProfileEntries,
} from '../src/work/project-profile/store.js'

test('buildManagerPromptPayload injects repo-bound project profile into stable context', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-project-profile-'))
  const startupWorktree = '/repo/mimikit'
  const config = defaultConfig({ workDir: stateDir })

  await writeProjectProfileEntries(
    resolveProjectProfilePath(stateDir, startupWorktree),
    [
      {
        id: 'project-profile-entry-1',
        content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
        sourceInputId: 'input-user',
        sourceQuote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
        updatedAt: '2026-03-27T08:00:00.000Z',
      },
    ],
  )

  const payload = await buildManagerPromptPayload({
    stateDir,
    workDir: stateDir,
    startupWorktree,
    inputs: [],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
    wakeProfile: 'user_input',
    packetMode: 'standard',
  })

  expect(payload.prompt).toContain('<M:project_profile>')
  expect(payload.prompt).toContain(
    '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
  )
  expect(payload.prompt).toContain(
    '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
  )
})

test('buildManagerPromptPayload anchors manager as the orchestration layer before emitting actions', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-system-'))
  const startupWorktree = '/repo/mimikit'
  const config = defaultConfig({ workDir: stateDir })

  const payload = await buildManagerPromptPayload({
    stateDir,
    workDir: stateDir,
    startupWorktree,
    inputs: [],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
    wakeProfile: 'user_input',
    packetMode: 'standard',
  })

  expect(payload.prompt).toContain('# MIMIKIT')
  expect(payload.prompt).toContain('你是 MIMIKIT 的主 agent 编排层')
  expect(payload.prompt).toContain('主线程只保留目标、计划、当前状态、验收门禁')
  expect(payload.prompt).toContain('文件系统是真相源')
  expect(payload.prompt).toContain('证据不足时停在 handoff 或待续跑')
  expect(payload.prompt).toContain('证据充分时默认推进')
  expect(payload.prompt).toContain('不要停在“如果要/可以继续”一类可能性话术')
  expect(payload.prompt).not.toContain(
    '当前仓库写任务默认走 `use_worktree=true`',
  )
  expect(payload.prompt).toContain('intent-evidence guard 是风险分级门禁')
  expect(payload.prompt).toContain(
    '只有在目录边界独立且互不冲突时才并发多个 `enqueue_task`',
  )
  expect(payload.prompt).toContain('输出 action 前，先逐项核对')
  expect(payload.prompt).toContain('未列出的 action 视为本轮不可用')
  expect(payload.prompt).toContain('不要猜测隐藏字段、兼容别名或默认值')
})
