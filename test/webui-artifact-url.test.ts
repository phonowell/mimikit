import { expect, test } from 'vitest'

import { toArtifactUrl } from '../webui/artifact-url.js'

test('toArtifactUrl maps task archive path to state files URL', () => {
  const href = toArtifactUrl(
    '/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md',
  )
  expect(href).toBe(
    '/state-files/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md',
  )
})

test('toArtifactUrl maps generated path to state files URL', () => {
  const href = toArtifactUrl(
    '/Users/mimiko/Projects/mimikit/.mimikit/generated/reports/health.json',
  )
  expect(href).toBe('/state-files/generated/reports/health.json')
})

test('toArtifactUrl maps generated relative path to state files URL', () => {
  const href = toArtifactUrl('generated/reports/health.json')
  expect(href).toBe('/state-files/generated/reports/health.json')
})

test('toArtifactUrl maps tasks relative path to state files URL', () => {
  const href = toArtifactUrl(
    'tasks/2026-03-04/task-dcfbbc3550fa44a09d137323bf644eca_task.md',
  )
  expect(href).toBe(
    '/state-files/tasks/2026-03-04/task-dcfbbc3550fa44a09d137323bf644eca_task.md',
  )
})

test('toArtifactUrl maps .mimikit relative file path to state files URL', () => {
  const href = toArtifactUrl('.mimikit/log.jsonl')
  expect(href).toBe('/state-files/log.jsonl')
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
