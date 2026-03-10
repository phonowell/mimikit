import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect } from 'vitest'

import { appendHistory } from '../../src/history/store.js'
import { pickQueryContextRequest } from '../../src/manager/query-context-tool.js'
import { appendTaskResultArchive } from '../../src/storage/task-results.js'
import { createTestRuntimeState } from './runtime-state.js'

import type { QueryContextRequest } from '../../src/manager/query-context-tool.js'
import type { RuntimeState } from '../../src/orchestrator/core/runtime-state.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-query-context-'))

export const createQueryContextRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  await mkdir(join(workDir, 'generated', 'reports'), { recursive: true })
  await writeFile(
    join(workDir, 'generated', 'deploy-notes.md'),
    ['# Deploy Notes', 'deploy service alpha with canary strategy'].join('\n'),
    'utf8',
  )
  await writeFile(
    join(workDir, 'generated', 'reports', 'summary.txt'),
    ['daily release summary', 'rollback checklist ready'].join('\n'),
    'utf8',
  )
  await writeFile(
    join(workDir, 'generated', 'binary.dat'),
    Buffer.from([0xff, 0xfe, 0x00, 0x01]),
  )
  const runtime = await createTestRuntimeState({
    workDir,
    pausedQueue: true,
    withGlobalFocus: false,
  })
  await mkdir(runtime.paths.memoryDir, { recursive: true })
  await writeFile(
    runtime.paths.memoryFile,
    [
      '# Deployment',
      'Use blue-green rollout',
      '',
      '# Incidents',
      'Track RCA checklist',
    ].join('\n'),
    'utf8',
  )
  await appendHistory(runtime.paths.history, {
    id: 'msg-1',
    role: 'user',
    text: 'deploy service alpha',
    createdAt: '2026-03-06T00:00:00.000Z',
    focusId: 'focus-release',
  })
  await appendHistory(runtime.paths.history, {
    id: 'msg-2',
    role: 'agent',
    text: 'deploy checklist ready',
    createdAt: '2026-03-06T01:00:00.000Z',
    focusId: 'focus-release',
  })
  await appendTaskResultArchive(workDir, {
    taskId: 'task-archive-1',
    focusId: 'focus-release',
    title: 'Deploy Archive One',
    status: 'succeeded',
    prompt: 'archive prompt',
    output: 'deploy output with details for archive lookup',
    createdAt: '2026-03-06T00:30:00.000Z',
    completedAt: '2026-03-06T01:30:00.000Z',
    durationMs: 1000,
  })
  await appendTaskResultArchive(workDir, {
    taskId: 'task-archive-2',
    focusId: 'focus-release',
    title: 'Deploy Archive Two',
    status: 'failed',
    prompt: 'archive prompt 2',
    output: 'deploy archive output with long content that can be truncated',
    createdAt: '2026-03-06T01:30:00.000Z',
    completedAt: '2026-03-06T02:30:00.000Z',
    durationMs: 1200,
  })

  runtime.tasks = [
    {
      id: 'task-1',
      fingerprint: 'fp-1',
      prompt: 'deploy api rollout',
      title: 'Deploy API',
      focusId: 'focus-release',
      profile: 'worker',
      status: 'running',
      createdAt: '2026-03-06T00:10:00.000Z',
    },
    {
      id: 'task-2',
      fingerprint: 'fp-2',
      prompt: 'cleanup backlog',
      title: 'Cleanup',
      focusId: 'focus-maintenance',
      profile: 'worker',
      status: 'pending',
      createdAt: '2026-03-05T00:10:00.000Z',
    },
  ]
  runtime.taskPlans = [
    {
      id: 'plan-1',
      prompt: 'deploy verification',
      title: 'Release Plan',
      focusId: 'focus-release',
      profile: 'worker',
      priority: 'normal',
      source: 'user_request',
      status: 'active',
      trigger: { mode: 'on_worker_slot_freed' },
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:40:00.000Z',
      runCount: 0,
    },
  ]
  runtime.focuses = [
    {
      id: 'focus-release',
      title: 'Release',
      status: 'active',
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:40:00.000Z',
      lastActivityAt: '2026-03-06T01:00:00.000Z',
    },
  ]
  runtime.focusContexts = [
    {
      focusId: 'focus-release',
      summary: 'deployment in progress',
      updatedAt: '2026-03-06T00:40:00.000Z',
    },
  ]
  return runtime
}

export const requireQueryContextRequest = (
  attrs: Record<string, string>,
): QueryContextRequest => {
  const request = pickQueryContextRequest([{ name: 'query_context', attrs }])
  expect(request).toBeDefined()
  return request as QueryContextRequest
}
