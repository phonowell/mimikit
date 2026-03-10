import { expect, test } from 'vitest'

import { buildFocusViews } from '../src/orchestrator/read-model/focus-view.js'
import type { FocusDigest, FocusMeta, Task } from '../src/types/index.js'

const createFocus = (overrides: Partial<FocusMeta> = {}): FocusMeta => ({
  id: 'focus-a',
  title: 'Focus A',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  lastActivityAt: '2026-03-01T00:00:00.000Z',
  ...overrides,
})

const createFocusDigest = (
  overrides: Partial<FocusDigest> = {},
): FocusDigest => ({
  focusId: 'focus-a',
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...overrides,
})

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-a',
  fingerprint: 'task-a',
  prompt: 'do work',
  title: 'Do work',
  cwd: '/tmp/focus-task',
  focusId: 'focus-a',
  profile: 'worker',
  provider: 'codex',
  status: 'succeeded',
  createdAt: '2026-03-01T00:00:00.000Z',
  completedAt: '2026-03-01T00:01:00.000Z',
  ...overrides,
})

test('buildFocusViews includes latest task id by focus', () => {
  const focuses: FocusMeta[] = [
    createFocus({
      id: 'focus-a',
      title: 'A',
      lastActivityAt: '2026-03-01T00:10:00.000Z',
      updatedAt: '2026-03-01T00:10:00.000Z',
    }),
    createFocus({
      id: 'focus-b',
      title: 'B',
      status: 'idle',
      lastActivityAt: '2026-03-01T00:05:00.000Z',
      updatedAt: '2026-03-01T00:05:00.000Z',
    }),
  ]
  const focusDigests: FocusDigest[] = [
    createFocusDigest({ focusId: 'focus-a' }),
    createFocusDigest({ focusId: 'focus-b' }),
  ]
  const tasks: Task[] = [
    createTask({
      id: 'task-a-old',
      focusId: 'focus-a',
      createdAt: '2026-03-01T00:00:00.000Z',
    }),
    createTask({
      id: 'task-a-new',
      focusId: 'focus-a',
      createdAt: '2026-03-01T00:09:00.000Z',
    }),
    createTask({
      id: 'task-b',
      focusId: 'focus-b',
      createdAt: '2026-03-01T00:04:00.000Z',
    }),
  ]

  const snapshot = buildFocusViews(focuses, focusDigests, 200, tasks)

  const focusA = snapshot.items.find((item) => item.id === 'focus-a')
  const focusB = snapshot.items.find((item) => item.id === 'focus-b')
  expect(focusA?.lastTaskId).toBe('task-a-new')
  expect(focusB?.lastTaskId).toBe('task-b')
})

test('buildFocusViews sorts by active flag, status, activity time, then id', () => {
  const focuses: FocusMeta[] = [
    createFocus({
      id: 'focus-idle-a',
      status: 'idle',
      lastActivityAt: '2026-03-01T00:12:00.000Z',
      updatedAt: '2026-03-01T00:12:00.000Z',
    }),
    createFocus({
      id: 'focus-active-b',
      status: 'active',
      lastActivityAt: '2026-03-01T00:01:00.000Z',
      updatedAt: '2026-03-01T00:01:00.000Z',
    }),
    createFocus({
      id: 'focus-idle-c',
      status: 'idle',
      lastActivityAt: '2026-03-01T00:12:00.000Z',
      updatedAt: '2026-03-01T00:12:00.000Z',
    }),
    createFocus({
      id: 'focus-done-d',
      status: 'done',
      lastActivityAt: '2026-03-01T00:20:00.000Z',
      updatedAt: '2026-03-01T00:20:00.000Z',
    }),
  ]

  const snapshot = buildFocusViews(focuses, [], 200, [])
  expect(snapshot.items.map((item) => item.id)).toEqual([
    'focus-active-b',
    'focus-idle-a',
    'focus-idle-c',
    'focus-done-d',
  ])
})
