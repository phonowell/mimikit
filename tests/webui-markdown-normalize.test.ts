import { expect, test } from 'vitest'

import { buildArchiveViewerUrlFromSource } from '../webui-src/lib/archive-viewer-url.js'
import { normalizeMarkdownForRender } from '../webui-src/lib/markdown-normalize.js'

test('normalizeMarkdownForRender preserves markdown link destinations with surrounding spaces', () => {
  const input =
    '查看归档：[任务归档]( /Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-27/task-8c132d08f769477da3f1891c3fb44346_task.md )'

  expect(normalizeMarkdownForRender(input)).toBe(input)
})

test('normalizeMarkdownForRender still linkifies bare task archive paths', () => {
  const input =
    '归档路径：/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-27/task-8c132d08f769477da3f1891c3fb44346_task.md'

  expect(normalizeMarkdownForRender(input)).toBe(
    `归档路径：[${'/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-27/task-8c132d08f769477da3f1891c3fb44346_task.md'}](${buildArchiveViewerUrlFromSource('/state-files/tasks/2026-03-27/task-8c132d08f769477da3f1891c3fb44346_task.md')})`,
  )
})
