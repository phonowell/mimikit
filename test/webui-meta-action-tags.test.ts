import { describe, expect, it } from 'vitest'

import { extractMetaActions } from '../webui/messages/meta-action-tags.js'

describe('extractMetaActions', () => {
  it('extracts self-closing actions and strips them from rendered text', () => {
    const input = 'Before\n<M:read_file path="README.md" />\nAfter'
    const result = extractMetaActions(input)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]).toMatchObject({
      id: 'action-1',
      name: 'read_file',
      command: '<M:read_file path="README.md" />',
    })
    expect(result.cleanText).toBe('Before\n\nAfter')
  })

  it('keeps non-action content intact', () => {
    const input = 'Demo <M:not valid> text'
    const result = extractMetaActions(input)
    expect(result.actions).toHaveLength(0)
    expect(result.cleanText).toBe(input)
  })

  it('does not extract action-like text inside fenced code blocks', () => {
    const input =
      '```xml\n<M:read_file path="docs/a.md" />\n```\n<M:run_task title="ok" />'
    const result = extractMetaActions(input)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]).toMatchObject({ name: 'run_task' })
    expect(result.cleanText).toBe('```xml\n<M:read_file path="docs/a.md" />\n```')
  })

  it('does not extract action-like text inside inline code', () => {
    const input =
      'Example `<M:read_file path="docs/a.md" />` and <M:run_task title="ok" />'
    const result = extractMetaActions(input)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]).toMatchObject({ name: 'run_task' })
    expect(result.cleanText).toBe('Example `<M:read_file path="docs/a.md" />` and')
  })
})
