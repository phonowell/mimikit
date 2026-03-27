import { expect, test } from 'vitest'

import { buildArchiveViewerUrlFromSource } from '../webui-src/lib/archive-viewer-url.js'
import { toArtifactUrl } from '../webui-src/lib/artifact-url.js'

test('toArtifactUrl rewrites pseudo-anchor absolute task archive paths', () => {
  expect(
    toArtifactUrl(
      '#/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-27/task-270f074c277e49d5939e4959bdcc6dc1_webui-worker.md#L43',
    ),
  ).toBe(
    buildArchiveViewerUrlFromSource(
      '/state-files/tasks/2026-03-27/task-270f074c277e49d5939e4959bdcc6dc1_webui-worker.md#L43',
    ),
  )
})

test('toArtifactUrl rewrites absolute workspace markdown paths', () => {
  expect(
    toArtifactUrl(
      '/Users/mimiko/Projects/mimikit/plans/report_webui-worker-file-image-bridge-20260327.md#L1',
    ),
  ).toBe(
    buildArchiveViewerUrlFromSource(
      '/api/workspace-file?path=%2FUsers%2Fmimiko%2FProjects%2Fmimikit%2Fplans%2Freport_webui-worker-file-image-bridge-20260327.md',
    ),
  )
})

test('toArtifactUrl does not rewrite unsupported workspace files', () => {
  expect(toArtifactUrl('/Users/mimiko/Projects/mimikit/.env')).toBeNull()
})
