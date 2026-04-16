import { expect, test } from 'vitest'

import { extractArtifactLinksFromText } from '../src/surface/shared/artifact-link.js'
import { formatManagerVisibleTaskResultReply } from '../src/policy/manager/task-result-visible-reply.js'
import { getMessageLocalPathsToSkip } from '../webui-src/lib/messages.js'
import { normalizeMarkdownForRender } from '../webui-src/lib/markdown-normalize.js'

import type { TaskResult } from '../src/foundation/types/index.js'
import type { SurfaceArtifactLink } from '../src/surface/shared/artifact-link.js'

const TASK_ARCHIVE_ARTIFACT: SurfaceArtifactLink = {
  href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-1.md',
  label: '.mimikit/tasks/task-1.md',
  path: '.mimikit/tasks/task-1.md',
  kind: 'task_archive',
  note: '任务归档',
}

test('skips only artifact-backed local paths during markdown normalization', () => {
  const skipLocalPaths = getMessageLocalPathsToSkip({
    text: '任务归档：.mimikit/tasks/task-1.md\n补充路径：plans/notes.md',
    artifacts: [TASK_ARCHIVE_ARTIFACT],
  })

  expect(
    normalizeMarkdownForRender(
      '任务归档：.mimikit/tasks/task-1.md\n补充路径：plans/notes.md',
      { skipLocalPaths },
    ),
  ).toContain('任务归档：.mimikit/tasks/task-1.md')
  expect(
    normalizeMarkdownForRender(
      '任务归档：.mimikit/tasks/task-1.md\n补充路径：plans/notes.md',
      { skipLocalPaths },
    ),
  ).toContain(
    '补充路径：[plans/notes.md](/archive-viewer.html?src=%2Fapi%2Fworkspace-file%3Fpath%3Dplans%252Fnotes.md)',
  )
})

test('returns empty skip list when message has no artifacts', () => {
  expect(
    getMessageLocalPathsToSkip({
      text: '任务归档：.mimikit/tasks/task-1.md',
      artifacts: [],
    }),
  ).toEqual([])
})

test('stops task archive links at .md before adjacent Chinese text', () => {
  const text = '任务归档：.mimikit/tasks/task-1.md后文说明'

  expect(normalizeMarkdownForRender(text)).toContain(
    '任务归档：[.mimikit/tasks/task-1.md](/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-1.md)后文说明',
  )
  expect(extractArtifactLinksFromText(text)).toEqual([
    {
      href: '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2Ftask-1.md',
      label: '.mimikit/tasks/task-1.md',
      path: '.mimikit/tasks/task-1.md',
    },
  ])
})

test('fallback task-result reply keeps archive link out of body text when artifact exists', () => {
  const result: TaskResult = {
    taskId: 'task-1',
    status: 'succeeded',
    ok: true,
    output: 'done',
    archivePath: '.mimikit/tasks/task-1.md',
    durationMs: 12,
    completedAt: '2026-04-16T10:00:00.000Z',
  }

  expect(
    formatManagerVisibleTaskResultReply({
      result,
      workDir: '/tmp/mimikit',
    }),
  ).toContain('任务归档已附上。')
  expect(
    formatManagerVisibleTaskResultReply({
      result,
      workDir: '/tmp/mimikit',
    }),
  ).not.toContain('.mimikit/tasks/task-1.md')
})
