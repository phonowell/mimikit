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

test('normalizeMarkdownForRender linkifies task archive path to state files URL', () => {
  const source =
    '路径：/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md'
  const normalized = normalizeMarkdownForRender(source)
  expect(normalized).toBe(
    '路径：[/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md](/state-files/tasks/2026-03-04/task-571afad1189d4c23ab43c5485f2f9827_brew-doctor-1.md)',
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
