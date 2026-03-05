import { expect, test } from 'vitest'

import { normalizeMarkdownForRender } from '../webui/markdown-normalize.js'

test('normalizeMarkdownForRender linkifies plain .mimikit path', () => {
  const source = '归档证据：/Users/mimiko/Projects/mimikit/.mimikit/log.jsonl'
  const normalized = normalizeMarkdownForRender(source)
  expect(normalized).toBe(
    '归档证据：[/Users/mimiko/Projects/mimikit/.mimikit/log.jsonl](/state-files/log.jsonl)',
  )
})

test('normalizeMarkdownForRender linkifies windows-style .mimikit relative path', () => {
  const source = '路径：.mimikit\\log.jsonl'
  const normalized = normalizeMarkdownForRender(source)
  expect(normalized).toBe('路径：[.mimikit\\log.jsonl](/state-files/log.jsonl)')
})

test('normalizeMarkdownForRender linkifies task archive path to archive viewer URL', () => {
  const source =
    '路径：/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md'
  const normalized = normalizeMarkdownForRender(source)
  expect(normalized).toBe(
    '路径：[/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md](/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F2026-03-04%2Ftask-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md)',
  )
})

test('normalizeMarkdownForRender linkifies relative task archive paths in archive lines', () => {
  const source = [
    '任务归档: tasks/2026-03-04/task-051587863a59426a8d6c137da9edfa51_task.md',
    '任务归档: tasks/2026-03-04/task-dcfbbc3550fa44a09d137323bf644eca_task.md',
  ].join('\n')
  const normalized = normalizeMarkdownForRender(source)
  expect(normalized).toBe(
    [
      '任务归档: [tasks/2026-03-04/task-051587863a59426a8d6c137da9edfa51_task.md](/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F2026-03-04%2Ftask-051587863a59426a8d6c137da9edfa51_task.md)',
      '任务归档: [tasks/2026-03-04/task-dcfbbc3550fa44a09d137323bf644eca_task.md](/archive-viewer.html?src=%2Fstate-files%2Ftasks%2F2026-03-04%2Ftask-dcfbbc3550fa44a09d137323bf644eca_task.md)',
    ].join('\n'),
  )
})

test('normalizeMarkdownForRender does not linkify inline code paths', () => {
  const source = '证据：`/Users/mimiko/Projects/mimikit/.mimikit/log.jsonl`'
  expect(normalizeMarkdownForRender(source)).toBe(source)
})

test('normalizeMarkdownForRender keeps existing markdown links unchanged', () => {
  const source = '[证据](/Users/mimiko/Projects/mimikit/.mimikit/log.jsonl)'
  expect(normalizeMarkdownForRender(source)).toBe(source)
})

test('normalizeMarkdownForRender does not linkify fenced code block paths', () => {
  const source = [
    '```txt',
    '/Users/mimiko/Projects/mimikit/.mimikit/log.jsonl',
    '```',
  ].join('\n')
  expect(normalizeMarkdownForRender(source)).toBe(source)
})
