import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { appendHistory } from '../src/history/store.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'

test('recent_history is summarized into stable pointers instead of full content', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-recent-history-summary-'))
  const config = defaultConfig({ workDir: stateDir })
  const historyDir = join(stateDir, 'history')
  await mkdir(historyDir, { recursive: true })
  await appendHistory(historyDir, {
    id: 'agent-history-summary-1',
    role: 'agent',
    text: '这里是一大段历史内容，应该只在摘要中保留指针而非全文。',
    createdAt: '2026-03-07T10:00:00.000Z',
    focusId: 'focus-global',
  })
  await writeFile(join(historyDir, '2026-03-08.jsonl'), '', 'utf8')

  const payload = await buildManagerPromptPayload({
    stateDir,
    workDir: stateDir,
    inputs: [],
    results: [],
    tasks: [],
    promptSectionLimits: config.manager.promptSections,
  })

  expect(payload.suffix).toContain('<M:event_packet>')
  expect(payload.suffix).toContain('"recent_history"')
  expect(payload.suffix).toContain('agent-history-summary-1')
  expect(payload.suffix).not.toContain('这里是一大段历史内容')
})
