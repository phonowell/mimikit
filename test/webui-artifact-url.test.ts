import { expect, test } from 'vitest'

import { toArtifactUrl } from '../webui/artifact-url.js'

test('toArtifactUrl maps task archive path to archive viewer URL', () => {
  const href = toArtifactUrl(
    '/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md',
  )
  expect(href).toBe(
    '/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F2026-03-04%2Ftask-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md',
  )
})

test('toArtifactUrl maps generated path to state files URL', () => {
  const href = toArtifactUrl(
    '/Users/mimiko/Projects/mimikit/.mimikit/generated/reports/health.json',
  )
  expect(href).toBe('/state-files/generated/reports/health.json')
})

test('toArtifactUrl maps absolute .mimikit file path to state files URL', () => {
  const href = toArtifactUrl(
    '/Users/mimiko/Projects/mimikit/.mimikit/memory/MEMORY.md',
  )
  expect(href).toBe('/state-files/memory/MEMORY.md')
})

test('toArtifactUrl leaves non-local URLs unchanged', () => {
  const href = toArtifactUrl('https://example.com/file.md')
  expect(href).toBeNull()
})
