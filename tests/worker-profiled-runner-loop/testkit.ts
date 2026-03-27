import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Task } from '../../src/foundation/types/index.js'

export const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-worker-loop-'))

export const createTask = (id: string, prompt = '执行测试任务'): Task => ({
  id,
  fingerprint: `fingerprint-${id}`,
  semanticKey: `semantic-${id}`,
  executionSpecId: `spec-${id}`,
  title: prompt,
  cwd: '/tmp/worker-loop',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-04T00:00:00.000Z',
})
