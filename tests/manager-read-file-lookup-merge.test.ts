import { expect, test } from 'vitest'

import { mergeReadFileLookupHistory } from '../src/manager/loop-batch-run-helpers.js'

test('mergeReadFileLookupHistory preserves prior file snippets across correction rounds', () => {
  const merged = mergeReadFileLookupHistory({
    previous: [
      {
        path: 'docs/spec.md',
        status: 'ok',
        encoding: 'utf-8',
        fromLine: 1,
        lineCount: 100,
        totalLines: 103,
        truncated: true,
        content: 'head',
      },
    ],
    current: [
      {
        path: 'docs/spec.md',
        status: 'ok',
        encoding: 'utf-8',
        fromLine: 101,
        lineCount: 3,
        totalLines: 103,
        truncated: false,
        content: 'tail',
      },
    ],
  })
  expect(merged).toHaveLength(2)
  expect(merged?.[0]?.fromLine).toBe(1)
  expect(merged?.[1]?.fromLine).toBe(101)
})

test('mergeReadFileLookupHistory deduplicates identical lookup entries', () => {
  const merged = mergeReadFileLookupHistory({
    previous: [
      {
        path: 'docs/spec.md',
        status: 'ok',
        encoding: 'utf-8',
        fromLine: 1,
        lineCount: 103,
        totalLines: 103,
        truncated: false,
        content: 'full',
      },
    ],
    current: [
      {
        path: 'docs/spec.md',
        status: 'ok',
        encoding: 'utf-8',
        fromLine: 1,
        lineCount: 103,
        totalLines: 103,
        truncated: false,
        content: 'full duplicate',
      },
    ],
  })
  expect(merged).toHaveLength(1)
})
