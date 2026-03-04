import { expect, test } from 'vitest'
import { parse as parseYaml } from 'yaml'

import {
  formatResultsYaml,
  formatTasksYaml,
} from '../src/prompts/format-content.js'

import type { Task, TaskResult } from '../src/types/index.js'

const baseTask = (overrides?: Partial<Task>): Task => ({
  id: 'task-archive-path-1',
  fingerprint: 'fingerprint-1',
  prompt: 'run archive path check',
  title: 'archive path check',
  focusId: 'focus-global',
  profile: 'worker',
  status: 'succeeded',
  createdAt: '2026-03-03T00:00:00.000Z',
  completedAt: '2026-03-03T00:00:01.000Z',
  ...overrides,
})

const baseResult = (overrides?: Partial<TaskResult>): TaskResult => ({
  taskId: 'task-archive-path-1',
  status: 'succeeded',
  ok: true,
  output: 'done',
  durationMs: 100,
  completedAt: '2026-03-03T00:00:01.000Z',
  ...overrides,
})

test('formatTasksYaml prefers result archive_path over task archive_path', () => {
  const task = baseTask({ archivePath: '/tmp/task.md' })
  const result = baseResult({ archivePath: '/tmp/result.md' })

  const yaml = formatTasksYaml([task], [result])
  const parsed = parseYaml(yaml) as {
    tasks: Array<{ archive_path?: string; result?: { archive_path?: string } }>
  }

  expect(parsed.tasks[0]?.archive_path).toBe('/tmp/result.md')
  expect(parsed.tasks[0]?.result?.archive_path).toBe('/tmp/result.md')
})

test('formatResultsYaml falls back to task archive_path when result archive_path is missing', () => {
  const task = baseTask({ archivePath: '/tmp/task.md' })
  const result = baseResult()

  const yaml = formatResultsYaml([task], [result])
  const parsed = parseYaml(yaml) as {
    tasks: Array<{ archive_path?: string; result?: { archive_path?: string } }>
  }

  expect(parsed.tasks[0]?.archive_path).toBe('/tmp/task.md')
  expect(parsed.tasks[0]?.result?.archive_path).toBe('/tmp/task.md')
})

test('formatTasksYaml rewrites archive_path to work_dir-relative path when inside work_dir', () => {
  const workDir = '/Users/mimiko/Projects/mimikit'
  const archivePath =
    '/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-1.md'
  const task = baseTask({ archivePath })
  const result = baseResult({ archivePath })

  const yaml = formatTasksYaml([task], [result], workDir)
  const parsed = parseYaml(yaml) as {
    tasks: Array<{ archive_path?: string; result?: { archive_path?: string } }>
  }

  expect(parsed.tasks[0]?.archive_path).toBe('.mimikit/tasks/2026-03-04/task-1.md')
  expect(parsed.tasks[0]?.result?.archive_path).toBe(
    '.mimikit/tasks/2026-03-04/task-1.md',
  )
})

test('formatResultsYaml keeps archive_path as-is when outside work_dir', () => {
  const workDir = '/Users/mimiko/Projects/mimikit'
  const archivePath = '/Users/mimiko/Projects/other/.mimikit/tasks/task-1.md'
  const task = baseTask({ archivePath })
  const result = baseResult()

  const yaml = formatResultsYaml([task], [result], workDir)
  const parsed = parseYaml(yaml) as {
    tasks: Array<{ archive_path?: string; result?: { archive_path?: string } }>
  }

  expect(parsed.tasks[0]?.archive_path).toBe(archivePath)
  expect(parsed.tasks[0]?.result?.archive_path).toBe(archivePath)
})
