import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

vi.mock('../src/manager/loop.js', () => ({
  managerLoop: vi.fn(async () => {}),
}))

vi.mock('../src/worker/loop.js', () => ({
  workerLoop: vi.fn(async () => {}),
}))

vi.mock('../src/evolver/loop.js', () => ({
  evolverLoop: vi.fn(async () => {}),
}))

import { defaultConfig } from '../src/config.js'
import { Orchestrator } from '../src/orchestrator/core/orchestrator-service.js'
import { readHistory } from '../src/storage/jsonl.js'

test('orchestrator start appends startup system message to history', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-startup-history-'))
  const orchestrator = new Orchestrator(defaultConfig({ workDir }))

  await orchestrator.start()

  const history = await readHistory(join(workDir, 'history.jsonl'))
  expect(history.length).toBeGreaterThan(0)
  expect(history.at(-1)?.role).toBe('system')
  expect(history.at(-1)?.text).toBe('系统已启动')

  orchestrator.stop()
})
