import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths, ensureStateDirs } from '../src/fs/paths.js'
import { appendManagerFallbackReply } from '../src/manager/history.js'
import { buildFallbackReply } from '../src/manager/loop-helpers.js'
import { readHistory } from '../src/storage/jsonl.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-fallback-'))

const prepareManagerPrompts = async (workDir: string): Promise<void> => {
  const managerDir = join(workDir, 'prompts', 'manager')
  await mkdir(managerDir, { recursive: true })
  await writeFile(join(managerDir, 'fallback-reply.md'), '继续处理中', 'utf8')
  await writeFile(
    join(managerDir, 'system-fallback-reply.md'),
    '系统暂不可用',
    'utf8',
  )
}

test('buildFallbackReply uses externalized manager fallback template', async () => {
  const workDir = await createTmpDir()
  await prepareManagerPrompts(workDir)

  const output = await buildFallbackReply({
    workDir,
    inputs: [],
    results: [],
  })

  expect(output).toBe('继续处理中')
})

test('appendManagerFallbackReply writes externalized system fallback text', async () => {
  const workDir = await createTmpDir()
  await prepareManagerPrompts(workDir)
  const stateDir = await createTmpDir()
  const paths = buildPaths(stateDir)
  await ensureStateDirs(paths)

  await appendManagerFallbackReply(workDir, paths)

  const history = await readHistory(paths.history)
  expect(history.at(-1)?.role).toBe('system')
  expect(history.at(-1)?.text).toBe('系统暂不可用')
})

test('buildFallbackReply throws when template is missing', async () => {
  const workDir = await createTmpDir()

  await expect(
    buildFallbackReply({
      workDir,
      inputs: [],
      results: [],
    }),
  ).rejects.toThrow('missing_prompt_template:manager/fallback-reply.md')
})
