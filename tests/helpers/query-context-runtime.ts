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

export const createQueryContextRuntime = async (options?: {
  useStateDir?: boolean
}): Promise<RuntimeState> => {
  const rootDir = await createTmpDir()
  const workDir = options?.useStateDir ? join(rootDir, '.mimikit') : rootDir
  const repoGeneratedDir = join(rootDir, 'generated')
  const stateGeneratedDir = options?.useStateDir
    ? join(workDir, 'generated')
    : join(rootDir, '.mimikit', 'generated')
  await mkdir(join(repoGeneratedDir, 'reports'), { recursive: true })
  await mkdir(join(stateGeneratedDir, 'reports'), { recursive: true })
  await writeFile(
    join(repoGeneratedDir, 'deploy-notes.md'),
    ['# Deploy Notes', 'deploy service alpha with canary strategy'].join('\n'),
    'utf8',
  )
  await writeFile(
    join(stateGeneratedDir, 'handoff.md'),
    ['# Handoff', 'resume deploy service alpha from partial result'].join('\n'),
    'utf8',
  )
  await writeFile(
    join(repoGeneratedDir, 'reports', 'summary.txt'),
    ['daily release summary', 'rollback checklist ready'].join('\n'),
    'utf8',
  )
  await writeFile(
    join(repoGeneratedDir, 'binary.dat'),
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
      title: 'Release Plan',
      focusId: 'focus-release',
      priority: 'normal',
      status: 'active',
      trigger: { mode: 'on_worker_slot_freed' },
      effect: {
        kind: 'enqueue_task',
        taskTemplate: {
          title: 'Deploy Verification',
          prompt: 'deploy verification',
          cwd: rootDir,
          contract: {
            goal: 'Verify deploy outcome',
            scope: 'Check release health for service alpha',
            acceptance: ['verification summary recorded'],
          },
        },
      },
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:40:00.000Z',
      runtime: { runCount: 0 },
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
      summary: 'deployment in progress',
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
