import { expect, test } from 'vitest'

import {
  buildMessagesExportFilename,
  buildMessagesMarkdownExport,
} from '../src/http/messages-export.js'
import { parseExportLimit } from '../src/http/helpers.js'

import type { ChatMessage } from '../src/supervisor/chat-view.js'

const sampleMessages: ChatMessage[] = [
  {
    id: 'u-1',
    role: 'user',
    text: '帮我设计一个导出功能。',
    createdAt: '2026-02-06T16:20:00.000Z',
  },
  {
    id: 'm-1',
    role: 'manager',
    text: '可以，先从 markdown 开始。',
    createdAt: '2026-02-06T16:20:03.000Z',
    quote: 'u-1',
    usage: { input: 1200, output: 2000 },
    elapsedMs: 3000,
  },
]

test('buildMessagesMarkdownExport outputs readable chat document', () => {
  const output = buildMessagesMarkdownExport({
    messages: sampleMessages,
    exportedAt: '2026-02-06T16:30:12.000Z',
    limit: 200,
  })

  expect(output).toContain('# Mimikit 对话导出')
  expect(output).toContain('# Mimikit 对话导出\n\n导出时间：')
  expect(output).toContain('导出时间：')
  expect(output).toContain('消息数：2')
  expect(output).toMatch(/### \[\d{2}:\d{2}:\d{2}\] 我/)
  expect(output).toMatch(/### \[\d{2}:\d{2}:\d{2}\] 助手/)
  expect(output).toContain('> 引用 我')
  expect(output).toContain('Tokens: ↑ 1.2k ↓ 2k')
  expect(output).toContain('用时 3s')
  expect(output).toContain('帮我设计一个导出功能。')
})

test('buildMessagesMarkdownExport handles empty messages', () => {
  const output = buildMessagesMarkdownExport({
    messages: [],
    exportedAt: '2026-02-06T16:30:12.000Z',
    limit: 200,
  })

  expect(output).toContain('暂无消息')
})

test('buildMessagesExportFilename uses UTC timestamp format', () => {
  expect(buildMessagesExportFilename('2026-02-06T16:30:12.000Z')).toBe(
    'mimikit-chat-20260206-163012.md',
  )
})

test('parseExportLimit applies default and max guard', () => {
  expect(parseExportLimit(undefined)).toBe(200)
  expect(parseExportLimit(50)).toBe(50)
  expect(parseExportLimit(5000)).toBe(1000)
})
