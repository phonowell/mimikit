import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDirs: string[] = []
const tempWorktreeDirs = new Set<string>()

export const createGitRepo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-branch-override-'))
  tempDirs.push(dir)
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
  for (const dir of tempWorktreeDirs)
    await rm(dir, { recursive: true, force: true })
  tempWorktreeDirs.clear()
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
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
  const path = join(cwd, '.worktrees', `${branchPath}-${branchKey}`)
  tempWorktreeDirs.add(path)
  return path
}
