import { expect, test } from 'vitest'

import {
  buildStateTaskMarkdownViewerRedirect,
  isStateTaskMarkdownPath,
} from '../src/http/index.js'

test('isStateTaskMarkdownPath only matches task markdown paths', () => {
  expect(
    isStateTaskMarkdownPath(
      '/state-files/tasks/2026-03-06/task-abc123_archive.md',
    ),
  ).toBe(true)
  expect(
    isStateTaskMarkdownPath(
      '/state-files/generated/reports/daily.md',
    ),
  ).toBe(false)
})

test('buildStateTaskMarkdownViewerRedirect preserves source query', () => {
  const redirect = buildStateTaskMarkdownViewerRedirect(
    '/state-files/tasks/2026-03-06/task-abc123_archive.md?download=1',
  )
  expect(redirect).toBe(
    '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F2026-03-06%2Ftask-abc123_archive.md%3Fdownload%3D1',
  )
})

test('buildStateTaskMarkdownViewerRedirect ignores non-task markdown paths', () => {
  const redirect = buildStateTaskMarkdownViewerRedirect(
    '/state-files/memory/MEMORY.md',
  )
  expect(redirect).toBeUndefined()
})

test('buildStateTaskMarkdownViewerRedirect skips redirect for explicit raw mode', () => {
  const redirect = buildStateTaskMarkdownViewerRedirect(
    '/state-files/tasks/2026-03-06/task-abc123_archive.md?raw=1',
  )
  expect(redirect).toBeUndefined()
})
