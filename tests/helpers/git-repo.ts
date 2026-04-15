import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { onTestFinished } from 'vitest'

const orphanTempRepos = new Set<string>()

const listGitWorktrees = (repoRoot: string): string[] => {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length).trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const cleanupGitRepo = async (repoRoot: string): Promise<void> => {
  const worktrees = listGitWorktrees(repoRoot)
  for (const worktreePath of worktrees) {
    if (worktreePath === repoRoot) continue
    await rm(worktreePath, { recursive: true, force: true })
  }
  await rm(repoRoot, { recursive: true, force: true })
}

const registerGitRepoCleanup = (repoRoot: string): void => {
  try {
    onTestFinished(async () => {
      orphanTempRepos.delete(repoRoot)
      await cleanupGitRepo(repoRoot)
    })
  } catch {
    orphanTempRepos.add(repoRoot)
  }
}

export const createGitRepo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-branch-override-'))
  registerGitRepoCleanup(dir)
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Mimikit Test'], {
    cwd: dir,
    stdio: 'ignore',
  })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {
    cwd: dir,
    stdio: 'ignore',
  })
  execFileSync('git', ['checkout', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src', 'index.ts'), 'export const ready = true\n')
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
  return dir
}

export const cleanupGitRepos = async (): Promise<void> => {
  const repos = [...orphanTempRepos]
  orphanTempRepos.clear()
  for (const repoRoot of repos) await cleanupGitRepo(repoRoot)
}

export const resolveExpectedWorktreePath = (
  cwd: string,
  branch: string,
): string => {
  const branchPath = branch
    .trim()
    .replace(/[/\\]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const branchKey = createHash('sha1').update(branch).digest('hex').slice(0, 8)
  return join(cwd, '.worktrees', `${branchPath}-${branchKey}`)
}
