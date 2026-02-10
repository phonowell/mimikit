import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

type ManagerPromptParams = Parameters<typeof buildManagerPrompt>[0]

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-prompt-'))

test('buildManagerPrompt renders results/tasks/history placeholders', async () => {
  const workDir = await createTmpDir()
  const managerDir = join(workDir, 'prompts', 'agents', 'manager')
  await mkdir(managerDir, { recursive: true })
  await writeFile(join(managerDir, 'system.md'), 'MANAGER_SYS', 'utf8')
  await writeFile(
    join(managerDir, 'injection.md'),
    'R:\n{results}\nI:\n{inputs}\nT:\n{tasks}\nH:\n{history}\nE:\n{environment}\n',
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
  expect(output).not.toContain('{results}')
})
