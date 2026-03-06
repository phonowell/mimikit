import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildManagerPrompt } from '../src/prompts/build-prompts.js'

const createStateDir = () => mkdtemp(join(tmpdir(), 'mimikit-manager-quote-ref-'))

test('buildManagerPrompt adds quote_ref from persisted history', async () => {
  const stateDir = await createStateDir()
  const config = defaultConfig({ workDir: stateDir })
  const historyDir = join(stateDir, 'history')
  await mkdir(historyDir, { recursive: true })
  await writeFile(
    join(historyDir, '2026-03-05.jsonl'),
    `${JSON.stringify({
      id: 'agent-quote-1',
      role: 'agent',
      text: '会话流日志输出目标错误，应该输出到 Node CLI。',
      createdAt: '2026-03-05T03:00:00.000Z',
      focusId: 'focus-mimikit-webui-quote',
    })}\n`,
    'utf8',
  )

  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-quote-1',
        role: 'user',
        text: '再看看这个',
        createdAt: '2026-03-05T03:01:00.000Z',
        focusId: 'focus-mimikit-webui-quote',
        quote: 'agent-quote-1',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(prompt).toMatch(/"quote"\s*:\s*"agent-quote-1"/)
  expect(prompt).toMatch(
    /"quote_ref"\s*:\s*\{\s*"id"\s*:\s*"agent-quote-1",\s*"role"\s*:\s*"agent"/,
  )
  expect(prompt).toMatch(/"content"\s*:\s*"会话流日志输出目标错误，应该输出到 Node CLI。"/)
})

test('buildManagerPrompt adds quote_ref when quote target exists in inflight inputs', async () => {
  const stateDir = await createStateDir()
  const config = defaultConfig({ workDir: stateDir })

  const prompt = await buildManagerPrompt({
    stateDir,
    workDir: stateDir,
    inputs: [
      {
        id: 'input-quote-target',
        role: 'user',
        text: 'worker 需要记录 sessionId，避免中断后重建。',
        createdAt: '2026-03-05T04:00:00.000Z',
        focusId: 'focus-mimikit-webui-quote',
      },
      {
        id: 'input-quote-follower',
        role: 'user',
        text: '就按这个继续',
        createdAt: '2026-03-05T04:01:00.000Z',
        focusId: 'focus-mimikit-webui-quote',
        quote: 'input-quote-target',
      },
    ],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(prompt).toMatch(/"quote"\s*:\s*"input-quote-target"/)
  expect(prompt).toMatch(
    /"quote_ref"\s*:\s*\{\s*"id"\s*:\s*"input-quote-target",\s*"role"\s*:\s*"user"/,
  )
  expect(prompt).toMatch(/"content"\s*:\s*"worker 需要记录 sessionId，避免中断后重建。"/)
})
