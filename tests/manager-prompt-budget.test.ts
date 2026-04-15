import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPromptPayload } from '../src/policy/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-prompt-'))

test('buildManagerPromptPayload keeps manager scaffolding within compact budget in standard mode', async () => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const iso = '2026-04-15T00:00:00.000Z'

  const payload = await buildManagerPromptPayload({
    stateDir: workDir,
    workDir,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'hi',
        focusId: 'focus-global',
        createdAt: iso,
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    focuses: [
      {
        id: 'focus-global',
        title: 'Global',
        status: 'active',
        createdAt: iso,
        updatedAt: iso,
        lastActivityAt: iso,
      },
    ],
    promptSectionLimits: config.manager.promptSections,
    wakeProfile: 'user_input',
    packetMode: 'standard',
  })

  expect(payload.promptSections.system).toBeLessThan(9300)
  expect(payload.promptSections.action_surface).toBeLessThan(1900)
})
