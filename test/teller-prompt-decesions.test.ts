import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
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
  const managerDir = join(workDir, 'prompts', 'manager')
  await mkdir(managerDir, { recursive: true })
  await writeFile(join(managerDir, 'system.md'), 'MANAGER_SYS', 'utf8')
  await writeFile(
    join(managerDir, 'injection.md'),
    'R:\n{results}\nI:\n{inputs}\nT:\n{tasks}\nH:\n{history}\nE:\n{environment}\nP:\n{persona}\nU:\n{user_profile}\n',
    'utf8',
  )
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

  expect(output).toContain('MANAGER_SYS')
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
  const managerDir = join(workDir, 'prompts', 'manager')
  await mkdir(managerDir, { recursive: true })
  await writeFile(join(managerDir, 'system.md'), 'MANAGER_SYS', 'utf8')
  await writeFile(
    join(managerDir, 'injection.md'),
    'P:\n{persona}\nU:\n{user_profile}\n',
    'utf8',
  )

  const params: ManagerPromptParams = {
    stateDir: workDir,
    workDir,
    inputs: [],
    results: [],
    tasks: [],
    history: [],
  }

  const output = await buildManagerPrompt(params)
  expect(output).toContain('P:')
  expect(output).toContain('U:')
  expect(output).toContain('<MIMIKIT:persona>\n\n</MIMIKIT:persona>')
  expect(output).toContain('<MIMIKIT:user_profile>\n\n</MIMIKIT:user_profile>')
  expect(output).not.toContain('<![CDATA[')
  expect(output).not.toContain('{persona}')
  expect(output).not.toContain('{user_profile}')
})

test('buildManagerPrompt flattens multiline result output into literal newline tokens', async () => {
  const workDir = await createTmpDir()
  const managerDir = join(workDir, 'prompts', 'manager')
  await mkdir(managerDir, { recursive: true })
  await writeFile(join(managerDir, 'system.md'), 'MANAGER_SYS', 'utf8')
  await writeFile(
    join(managerDir, 'injection.md'),
    'R:\n{results}\nT:\n{tasks}\n',
    'utf8',
  )

  const params: ManagerPromptParams = {
    stateDir: workDir,
    workDir,
    inputs: [],
    results: [
      {
        taskId: 'task-1',
        status: 'succeeded',
        ok: true,
        output: 'line-1\nline-2\r\nline-3\rline-4',
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
  expect(output).toContain('line-1\\\\nline-2\\\\nline-3\\\\nline-4')
  expect(output).not.toContain('line-1\nline-2')
})
