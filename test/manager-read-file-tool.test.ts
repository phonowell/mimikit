import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, expect, test } from 'vitest'

import {
  pickReadFileRequest,
  runReadFileTool,
} from '../src/manager/read-file-tool.js'

const tempDirs: string[] = []
const execFileAsync = promisify(execFile)

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
    maxChars: 8192,
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

test('runReadFileTool allows relative paths outside work_dir', async () => {
  const workDir = await createTempRepo()
  const outsideDir = await mkdtemp(join(tmpdir(), 'mimikit-read-file-outside-'))
  tempDirs.push(outsideDir)
  const outsideFile = join(outsideDir, 'outside.txt')
  await writeFile(outsideFile, 'outside', 'utf8')
  const result = await runReadFileTool({
    workDir,
    request: {
      path: relative(workDir, outsideFile),
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('ok')
  expect(result.content).toBe('outside')
})

test('runReadFileTool allows absolute paths outside work_dir', async () => {
  const workDir = await createTempRepo()
  const outsideDir = await mkdtemp(join(tmpdir(), 'mimikit-read-file-abs-'))
  tempDirs.push(outsideDir)
  const outsideFile = join(outsideDir, 'absolute.txt')
  await writeFile(outsideFile, 'absolute', 'utf8')
  const result = await runReadFileTool({
    workDir,
    request: {
      path: outsideFile,
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('ok')
  expect(result.content).toBe('absolute')
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

test('runReadFileTool rejects files larger than 1024KiB', async () => {
  const workDir = await createTempRepo()
  await writeFile(
    join(workDir, 'oversize.txt'),
    Buffer.alloc(1_024 * 1_024 + 1, 0x61),
  )
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'oversize.txt',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('error')
  expect(result.error).toContain('file is too large')
  expect(result.error).toContain('1048576')
})

test('runReadFileTool rejects directories', async () => {
  const workDir = await createTempRepo()
  await mkdir(join(workDir, 'nested'), { recursive: true })
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'nested',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('error')
  expect(result.error).toContain('not a regular file')
})

test('runReadFileTool rejects fifo paths on unix-like systems', async () => {
  if (platform() === 'win32') return
  const workDir = await createTempRepo()
  const fifoPath = join(workDir, 'named.pipe')
  await execFileAsync('mkfifo', [fifoPath])
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'named.pipe',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('error')
  expect(result.error).toContain('not a regular file')
})

test('runReadFileTool follows symlink target when it points to a regular file', async () => {
  if (platform() === 'win32') return
  const workDir = await createTempRepo()
  await writeFile(join(workDir, 'real.txt'), 'from-real', 'utf8')
  await symlink(join(workDir, 'real.txt'), join(workDir, 'link.txt'))
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'link.txt',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('ok')
  expect(result.content).toBe('from-real')
})

test('runReadFileTool rejects symlink target when it is not a regular file', async () => {
  if (platform() === 'win32') return
  const workDir = await createTempRepo()
  await mkdir(join(workDir, 'dir-target'), { recursive: true })
  await symlink(join(workDir, 'dir-target'), join(workDir, 'dir-link'))
  const result = await runReadFileTool({
    workDir,
    request: {
      path: 'dir-link',
      fromLine: 1,
      maxLines: 100,
      maxChars: 100,
    },
  })
  expect(result.status).toBe('error')
  expect(result.error).toContain('not a regular file')
})
