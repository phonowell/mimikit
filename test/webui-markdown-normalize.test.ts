import { describe, expect, it } from 'vitest'

import { normalizeMarkdownForRender } from '../src/webui/markdown-normalize.js'

describe('normalizeMarkdownForRender', () => {
  it('normalizes missing-space ordered list markers', () => {
    const source = [
      '你想怎么继续？',
      '',
      '1.允许我再新开一个任务',
      '1.改抓更稳定的页面',
      '1.先不抓了',
    ].join('\n')
    const result = normalizeMarkdownForRender(source)
    expect(result).toContain('1. 允许我再新开一个任务')
    expect(result).toContain('1. 改抓更稳定的页面')
    expect(result).toContain('1. 先不抓了')
  })

  it('normalizes parenthesized ordered markers', () => {
    const source = ['1) one', '2)two', '3)three'].join('\n')
    expect(normalizeMarkdownForRender(source)).toBe(
      ['1. one', '2. two', '3. three'].join('\n'),
    )
  })

  it('flattens unordered-wrapped ordered markers', () => {
    const source = [
      '你想怎么继续？',
      '',
      '- 1.允许我再新开一个任务',
      '- 1)改抓更稳定的页面',
      '- 1. 先不抓了',
    ].join('\n')
    expect(normalizeMarkdownForRender(source)).toBe(
      [
        '你想怎么继续？',
        '',
        '1. 允许我再新开一个任务',
        '1. 改抓更稳定的页面',
        '1. 先不抓了',
      ].join('\n'),
    )
  })

  it('does not mutate decimal-like lines', () => {
    const source = '1.23 is a number'
    expect(normalizeMarkdownForRender(source)).toBe(source)
  })

  it('does not flatten decimal-like unordered lines', () => {
    const source = '- 1.23 is a number'
    expect(normalizeMarkdownForRender(source)).toBe(source)
  })
})
