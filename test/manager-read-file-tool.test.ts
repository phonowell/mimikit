import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  pickReadFileRequest,
  runReadFileTool,
} from '../src/manager/read-file-tool.js'

const tempDirs: string[] = []

const createTempRepo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-read-file-'))
  tempDirs.push(dir)
  await mkdir(join(dir, '.mimikit', 'history'), { recursive: true })
  await mkdir(join(dir, '.mimikit', 'generated'), { recursive: true })
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pickReadFileRequest parses read_file attrs', () => {
  const request = pickReadFileRequest([
    {
      name: 'read_file',
      attrs: {
        path: 'docs/plan.md',
        from_line: '3',
        max_lines: '500',
        max_chars: '100',
      },
    },
  ])
  expect(request).toEqual({
    path: 'docs/plan.md',
    fromLine: 3,
    maxLines: 500,
    maxChars: 100,
  })
})

test('pickReadFileRequest rejects invalid optional numeric attrs', () => {
  const request = pickReadFileRequest([
    {
      name: 'read_file',
      attrs: {
        path: 'docs/plan.md',
        max_lines: '1e2',
      },
    },
  ])
  expect(request).toBeUndefined()
})

test('pickReadFileRequest applies default line window', () => {
  const request = pickReadFileRequest([
    {
      name: 'read_file',
      attrs: {
        path: 'docs/plan.md',
      },
    },
  ])
  expect(request).toEqual({
    path: 'docs/plan.md',
    fromLine: 1,
    maxLines: 100,
    maxChars: 4000,
  })
})

test('runReadFileTool truncates utf-8 content by max_chars', async () => {
  const workDir = await createTempRepo()
  await mkdir(join(workDir, 'docs'), { recursive: true })
  await writeFile(
    join(workDir, 'docs', 'notes.md'),
    'line1\nsecond line\nthird line\n',
    'utf8',
  )
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'docs/notes.md',
      fromLine: 1,
      maxLines: 100,
      maxChars: 6,
    },
  })

  expect(result.status).toBe('ok')
  expect(result.encoding).toBe('utf-8')
  expect(result.path).toBe('docs/notes.md')
  expect(result.fromLine).toBe(1)
  expect(result.lineCount).toBe(3)
  expect(result.totalLines).toBe(3)
  expect(result.truncated).toBe(true)
  expect(result.content).toBe('line1\n')
})

test('runReadFileTool slices content by from_line with max_lines', async () => {
  const workDir = await createTempRepo()
  await mkdir(join(workDir, 'docs'), { recursive: true })
  await writeFile(join(workDir, 'docs', 'window.md'), 'l1\nl2\nl3\nl4\n', 'utf8')
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'docs/window.md',
      fromLine: 2,
      maxLines: 2,
      maxChars: 100,
    },
  })

  expect(result.status).toBe('ok')
  expect(result.content).toBe('l2\nl3\n')
  expect(result.fromLine).toBe(2)
  expect(result.lineCount).toBe(2)
  expect(result.totalLines).toBe(4)
  expect(result.truncated).toBe(true)
})

test('runReadFileTool rejects paths outside work_dir', async () => {
  const workDir = await createTempRepo()
  const result = await runReadFileTool({
    workDir,
    request: {
      path: '../outside.txt',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('error')
  expect(result.error).toContain('outside repository')
})

test('runReadFileTool allows .mimikit paths', async () => {
  const workDir = await createTempRepo()
  await writeFile(
    join(workDir, '.mimikit', 'history', '2026-01-01.jsonl'),
    'secret',
    'utf8',
  )
  const result = await runReadFileTool({
    workDir,
    request: {
      path: '.mimikit/history/2026-01-01.jsonl',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('ok')
  expect(result.content).toBe('secret')
})

test('runReadFileTool allows non-state paths that only share .mimikit prefix', async () => {
  const workDir = await createTempRepo()
  await mkdir(join(workDir, '.mimikit-tools'), { recursive: true })
  await writeFile(join(workDir, '.mimikit-tools', 'ok.txt'), 'hello', 'utf8')
  const result = await runReadFileTool({
    workDir,
    request: {
      path: '.mimikit-tools/ok.txt',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('ok')
  expect(result.content).toBe('hello')
})

test('runReadFileTool rejects non-utf8 files', async () => {
  const workDir = await createTempRepo()
  await writeFile(
    join(workDir, 'binary.bin'),
    Buffer.from([0xff, 0xfe, 0xfd]),
  )
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'binary.bin',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('error')
  expect(result.error).toContain('not valid UTF-8')
})
