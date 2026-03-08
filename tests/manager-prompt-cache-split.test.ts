import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'

test('buildManagerPromptPayload splits stable prefix and variable suffix', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-cache-split-'))
  const config = defaultConfig({ workDir: stateDir })

  const payload = await buildManagerPromptPayload({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-cache-split-1',
        role: 'user',
        text: '请继续推进任务',
        createdAt: '2026-03-07T10:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(payload.prefix).toContain('## 工作边界')
  expect(payload.prefix).not.toContain('<M:inputs>')
  expect(payload.prefix).not.toContain('<M:environment>')
  expect(payload.suffix).toContain('<M:inputs>')
  expect(payload.suffix).toContain('<M:environment>')
  expect(payload.prompt).toContain(payload.prefix)
  expect(payload.prompt).toContain(payload.suffix)
  expect(payload.promptSegments).toEqual([
    { text: payload.prefix, cacheControl: 'ephemeral' },
    { text: payload.suffix },
  ])
})
