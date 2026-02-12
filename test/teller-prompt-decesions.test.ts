import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

type ManagerPromptParams = Parameters<typeof buildManagerPrompt>[0]

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-prompt-'))

const getTagContent = (output: string, tag: string): string => {
  const match = output.match(
    new RegExp(`<MIMIKIT:${tag}>\\n([\\s\\S]*?)\\n</MIMIKIT:${tag}>`),
  )
  return match?.[1] ?? ''
}

test('buildManagerPrompt renders results/tasks/history placeholders', async () => {
  const workDir = await createTmpDir()
  await writeFile(join(workDir, 'agent_persona.md'), '# Persona\n\n- direct', 'utf8')
  await writeFile(
    join(workDir, 'user_profile.md'),
    '# User Profile\n\n- prefers concise answers',
    'utf8',
  )

  const params: ManagerPromptParams = {
    stateDir: workDir,
    workDir,
    inputs: [
      {
        id: 'in-1',
        text: '请给我一个示例',
        createdAt: '2026-02-08T00:00:00.000Z',
      },
    ],
    results: [
      {
        taskId: 'task-1',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: 10,
        completedAt: '2026-02-08T00:01:00.000Z',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        fingerprint: 'fp-1',
        prompt: 'do x',
        title: 'Task 1',
        profile: 'standard',
        status: 'succeeded',
        createdAt: '2026-02-08T00:00:10.000Z',
        completedAt: '2026-02-08T00:01:00.000Z',
      },
    ],
    history: [],
  }

  const output = await buildManagerPrompt(params)

  expect(output).toContain('<MIMIKIT:results>')
  expect(output).toContain('<MIMIKIT:inputs>')
  expect(output).toContain('<MIMIKIT:tasks>')
  expect(output).toContain('<MIMIKIT:persona>')
  expect(output).toContain('<MIMIKIT:user_profile>')
  expect(output).toContain('<MIMIKIT:environment>')
  expect(getTagContent(output, 'environment')).not.toContain('<![CDATA[')
  expect(getTagContent(output, 'persona')).not.toContain('<![CDATA[')
  expect(getTagContent(output, 'user_profile')).not.toContain('<![CDATA[')
  expect(output).not.toContain('{results}')
  expect(output).not.toContain('{persona}')
  expect(output).not.toContain('{user_profile}')
})

test('buildManagerPrompt keeps persona/profile placeholders empty when files are missing', async () => {
  const workDir = await createTmpDir()

  const params: ManagerPromptParams = {
    stateDir: workDir,
    workDir,
    inputs: [],
    results: [],
    tasks: [],
    history: [],
  }

  const output = await buildManagerPrompt(params)
  const persona = getTagContent(output, 'persona')
  const userProfile = getTagContent(output, 'user_profile')
  expect(output).toContain('<MIMIKIT:persona>\n\n</MIMIKIT:persona>')
  expect(output).toContain('<MIMIKIT:user_profile>\n\n</MIMIKIT:user_profile>')
  expect(persona).not.toContain('<![CDATA[')
  expect(userProfile).not.toContain('<![CDATA[')
  expect(output).not.toContain('{persona}')
  expect(output).not.toContain('{user_profile}')
})
