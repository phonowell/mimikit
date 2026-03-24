import { describe, expect, test } from 'vitest'
import {
  countTextLines,
  evaluateFileLengthStats,
  shouldCheckFilePath,
} from '../scripts/shared/file-length-guard.ts'

describe('file length guard', () => {
  test('counts text lines without trailing newline inflation', () => {
    expect(countTextLines('')).toBe(0)
    expect(countTextLines('alpha')).toBe(1)
    expect(countTextLines('alpha\nbeta\n')).toBe(2)
    expect(countTextLines('alpha\r\nbeta')).toBe(2)
  })

  test('checks only managed code and doc paths', () => {
    expect(shouldCheckFilePath('src/app.ts')).toBe(true)
    expect(shouldCheckFilePath('webui-src/App.tsx')).toBe(true)
    expect(shouldCheckFilePath('docs/design/workflow/task.md')).toBe(true)
    expect(shouldCheckFilePath('README.md')).toBe(true)
    expect(shouldCheckFilePath('package.json')).toBe(false)
    expect(shouldCheckFilePath('docs/todo/notes.md')).toBe(false)
  })

  test('flags new oversize files and baseline growth separately', () => {
    const violations = evaluateFileLengthStats({
      stats: [
        { path: 'src/new-file.ts', lineCount: 205 },
        { path: 'src/legacy.ts', lineCount: 260 },
        { path: 'src/stable.ts', lineCount: 240 },
        { path: 'src/small.ts', lineCount: 120 },
      ],
      limit: 200,
      exemptions: [
        { path: 'src/legacy.ts', maxLines: 250, reason: 'legacy debt' },
        { path: 'src/stable.ts', maxLines: 240, reason: 'stable debt' },
      ],
    })

    expect(violations).toEqual([
      {
        kind: 'exemption_grew',
        path: 'src/legacy.ts',
        lineCount: 260,
        limit: 250,
        reason: 'legacy debt',
      },
      {
        kind: 'new_oversize',
        path: 'src/new-file.ts',
        lineCount: 205,
        limit: 200,
      },
    ])
  })
})
