import { expect, test } from 'vitest'

import {
  type DocumentTitleContext,
  resolveDocumentTitle,
} from '../webui-src/lib/branding.js'

import type { TaskView } from '../webui-src/types.js'

const createTask = (overrides: Partial<TaskView> = {}): TaskView => ({
  id: 'task-1',
  status: 'running',
  title: 'Refactor title pipeline',
  createdAt: '2026-03-28T09:00:00.000Z',
  changeAt: '2026-03-28T09:10:00.000Z',
  startedAt: '2026-03-28T09:02:00.000Z',
  ...overrides,
})

const createContext = (
  overrides: Partial<DocumentTitleContext> = {},
): DocumentTitleContext => ({
  tasks: [createTask()],
  plansOpen: false,
  tasksOpen: false,
  confirmDialog: null,
  ...overrides,
})

test('resolveDocumentTitle prefers the current task object title over focus', () => {
  expect(
    resolveDocumentTitle(
      createContext({
        confirmDialog: {
          kind: 'task',
          id: 'task-1',
          title: 'Delete stale task',
        },
      }),
    ),
  ).toBe('Delete stale task · Mimikit')
})

test('resolveDocumentTitle keeps stable page names for overview dialogs', () => {
  expect(resolveDocumentTitle(createContext({ tasksOpen: true }))).toBe(
    'Tasks · Mimikit',
  )
  expect(resolveDocumentTitle(createContext({ plansOpen: true }))).toBe(
    'Plans · Mimikit',
  )
})

test('resolveDocumentTitle falls back to the running task when no stronger page is open', () => {
  expect(resolveDocumentTitle(createContext())).toBe(
    'Refactor title pipeline · Mimikit',
  )
})

test('resolveDocumentTitle falls back to the product name when no dialog or running task is active', () => {
  expect(resolveDocumentTitle(createContext({ tasks: [] }))).toBe('Mimikit')
})
