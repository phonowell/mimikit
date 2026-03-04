import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

test('manager prompt enforces concise reply and choice routing rules', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-prompt-rules-'))
  const config = defaultConfig({ workDir: stateDir })
  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-style-rule-1',
        role: 'user',
        text: '给我两个可选方案并让我选一个',
        createdAt: '2026-03-03T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(prompt).toContain('默认不寒暄、不复述用户已给出的任务、不做无效确认')
  expect(prompt).toContain(
    '只要答复中涉及任务结果，必须附上该任务归档地址：`任务归档: <archive_path>`',
  )
  expect(prompt).toContain('若上下文未提供 `archive_path`，必须明确写：`任务归档: 未生成`')
  expect(prompt).toContain('需要用户在有限候选中二选一/多选一：优先使用 `M:ask_user_choice`')
  expect(prompt).toContain('若输入来源包含 `qq`：禁止 `M:ask_user_choice`')
  expect(prompt).toContain('若收到 `trigger_fire` 且本轮同时有用户输入（`wake_profile=mixed`）：先响应用户最新目标；仅当不冲突时再执行该 trigger。')
  expect(prompt).not.toContain('docs/design/workflow/plan.md')
})
