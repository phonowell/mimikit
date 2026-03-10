import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { resolveTaskExecutionTarget } from '../src/shared/task-execution-target.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-task-target-'))
  tempDirs.push(dir)
  return dir
}

const runGit = (cwd: string, args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resolveTaskExecutionTarget extracts git common dir and branch from worktree cwd', async () => {
  const root = await createTmpDir()
  const repoDir = join(root, 'repo')
  const worktreeDir = join(root, 'repo-feature')

  runGit(root, ['init', '-b', 'main', repoDir])
  await writeFile(join(repoDir, 'README.md'), '# repo\n', 'utf8')
  runGit(repoDir, ['add', 'README.md'])
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'init',
    ],
    {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  runGit(repoDir, ['worktree', 'add', '-b', 'feature', worktreeDir, 'HEAD'])

  const target = await resolveTaskExecutionTarget(worktreeDir)
  const realWorktreeDir = await realpath(worktreeDir)
  const realRepoGitDir = await realpath(resolve(repoDir, '.git'))

  expect(target.cwd).toBe(realWorktreeDir)
  expect(target.repoKey).toBe(realRepoGitDir)
  expect(target.branch).toBe('feature')
})
