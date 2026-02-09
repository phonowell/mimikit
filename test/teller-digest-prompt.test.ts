import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildTellerDigestPrompt } from '../src/prompts/build-prompts.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-teller-digest-prompt-'))

test('buildTellerDigestPrompt renders externalized teller digest templates', async () => {
  const workDir = await createTmpDir()
  const tellerDir = join(workDir, 'prompts', 'agents', 'teller')
  await mkdir(tellerDir, { recursive: true })
  await writeFile(join(tellerDir, 'digest-system.md'), 'DIGEST_SYS', 'utf8')
  await writeFile(
    join(tellerDir, 'digest-injection.md'),
    'I:\n{inputs}\nT:\n{tasks}\nH:\n{history}\n',
    'utf8',
  )

  const output = await buildTellerDigestPrompt({
    workDir,
    inputs: [
      {
        id: 'in-1',
        text: '请先修摘要链路',
        createdAt: '2026-02-08T00:00:00.000Z',
      },
    ],
    tasks: [],
    history: [
      {
        id: 'h-1',
        role: 'user',
        text: '上轮我们讨论了 thinker 接收格式',
        createdAt: '2026-02-08T00:00:01.000Z',
      },
    ],
  })

  expect(output).toContain('DIGEST_SYS')
  expect(output).toContain('请先修摘要链路')
  expect(output).toContain('上轮我们讨论了 thinker 接收格式')
  expect(output).not.toContain('{inputs}')
  expect(output).not.toContain('{tasks}')
  expect(output).not.toContain('{history}')
})
