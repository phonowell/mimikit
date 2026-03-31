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
