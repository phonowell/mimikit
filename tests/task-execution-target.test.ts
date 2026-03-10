import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { cwd: string; encoding: string },
) => Promise<{ stdout: string; stderr: string }>

const { execFileAsyncMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn<ExecFileAsync>(),
}))

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>()
  return {
    ...actual,
    promisify: vi.fn(() => execFileAsyncMock),
  }
})

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

import { resolveTaskExecutionTarget } from '../src/shared/task-execution-target.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-task-target-'))
  tempDirs.push(dir)
  return dir
}

beforeEach(() => {
  execFileAsyncMock.mockReset()
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resolveTaskExecutionTarget extracts git common dir and branch from worktree cwd', async () => {
  const root = await createTmpDir()
  const repoDir = join(root, 'repo')
  const worktreeDir = join(root, 'repo-feature')

  await mkdir(join(repoDir, '.git'), { recursive: true })
  await mkdir(worktreeDir, { recursive: true })

  const realWorktreeDir = await realpath(worktreeDir)
  const realRepoGitDir = await realpath(resolve(repoDir, '.git'))

  execFileAsyncMock.mockImplementation(async (_file, args, options) => {
    expect(options.cwd).toBe(realWorktreeDir)

    if (args[0] === 'rev-parse' && args[1] === '--git-common-dir') {
      return {
        stdout: '../repo/.git\n',
        stderr: '',
      }
    }

    if (args[0] === 'symbolic-ref' && args[1] === '--short' && args[2] === 'HEAD') {
      return {
        stdout: 'feature\n',
        stderr: '',
      }
    }

    throw new Error(`unexpected git args: ${args.join(' ')}`)
  })

  const target = await resolveTaskExecutionTarget(worktreeDir)

  expect(target.cwd).toBe(realWorktreeDir)
  expect(target.repoKey).toBe(realRepoGitDir)
  expect(target.branch).toBe('feature')
  expect(execFileAsyncMock).toHaveBeenCalledTimes(2)
})
