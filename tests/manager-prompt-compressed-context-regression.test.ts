import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

test('manager prompt no longer injects M:compressed_context section', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-prompt-'))
  const config = defaultConfig({ workDir: stateDir })
  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-regression-1',
        role: 'user',
        text: '检查上下文压缩注入是否移除',
        createdAt: '2026-03-03T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(prompt).not.toContain('<M:compressed_context>')
  expect(prompt).not.toContain('M:compressed_context')
  expect(prompt).toContain('<M:event_packet>')
  expect(prompt).toContain('"packet"')
})
