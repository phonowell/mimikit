import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const expandHomeDir = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed === '~') return homedir()
  if (!trimmed.startsWith('~/')) return trimmed
  return resolve(homedir(), trimmed.slice(2))
}

const tryResolveRealpath = async (path: string): Promise<string> => {
  try {
    return await realpath(path)
  } catch {
    return path
  }
}

const runGitCapture = async (
  cwd: string,
  args: string[],
): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
    })
    const trimmed = stdout.trim()
    return trimmed.length > 0 ? trimmed : undefined
  } catch {
    return undefined
  }
}

const resolveRepoKey = async (cwd: string): Promise<string | undefined> => {
  const gitCommonDir = await runGitCapture(cwd, [
    'rev-parse',
    '--git-common-dir',
  ])
  if (!gitCommonDir) return undefined
  return tryResolveRealpath(resolve(cwd, gitCommonDir))
}

const resolveRepoRoot = async (cwd: string): Promise<string | undefined> => {
  const repoRoot = await runGitCapture(cwd, ['rev-parse', '--show-toplevel'])
  return repoRoot ? tryResolveRealpath(repoRoot) : undefined
}

const resolveBranch = async (cwd: string): Promise<string | undefined> => {
  const branch = await runGitCapture(cwd, ['symbolic-ref', '--short', 'HEAD'])
  if (branch) return branch
  const detachedHead = await runGitCapture(cwd, [
    'rev-parse',
    '--short',
    'HEAD',
  ])
  return detachedHead ? `HEAD:${detachedHead}` : undefined
}

export type TaskExecutionTarget = {
  cwd: string
  repoKey?: string
  branch?: string
}

type GitWorktreeEntry = {
  path: string
  branch?: string
}

const parseGitWorktreeList = async (
  output: string,
): Promise<GitWorktreeEntry[]> => {
  const entries: GitWorktreeEntry[] = []
  let currentPath: string | undefined
  let currentBranch: string | undefined
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) {
      if (currentPath) {
        entries.push({
          path: await tryResolveRealpath(currentPath),
          ...(currentBranch ? { branch: currentBranch } : {}),
        })
      }
      currentPath = undefined
      currentBranch = undefined
      continue
    }
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim()
      continue
    }
    if (line.startsWith('branch refs/heads/'))
      currentBranch = line.slice('branch refs/heads/'.length).trim()
  }
  if (!currentPath) return entries
  entries.push({
    path: await tryResolveRealpath(currentPath),
    ...(currentBranch ? { branch: currentBranch } : {}),
  })
  return entries
}

const listGitWorktrees = async (cwd: string): Promise<GitWorktreeEntry[]> => {
  const output = await runGitCapture(cwd, ['worktree', 'list', '--porcelain'])
  if (!output) return []
  return parseGitWorktreeList(output)
}

const sanitizeBranchForPath = (branch: string): string => {
  const normalized = branch
    .trim()
    .replace(/[/\\]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized.length > 0 ? normalized : 'branch'
}

const resolveAutoWorktreePath = (repoKey: string, branch: string): string => {
  const repoRoot = dirname(repoKey)
  const branchKey = createHash('sha1').update(branch).digest('hex').slice(0, 8)
  return join(
    dirname(repoRoot),
    `${basename(repoRoot)}-${sanitizeBranchForPath(branch)}-${branchKey}`,
  )
}

export const materializeTaskWorktreeCwd = async (
  cwd: string,
  branch: string,
): Promise<string> => {
  const resolvedCwd = resolve(expandHomeDir(cwd))
  const normalizedCwd = await tryResolveRealpath(resolvedCwd)
  const [repoRoot, repoKey, currentBranch] = await Promise.all([
    resolveRepoRoot(normalizedCwd),
    resolveRepoKey(normalizedCwd),
    resolveBranch(normalizedCwd),
  ])
  if (!repoRoot || !repoKey || currentBranch === branch) return normalizedCwd
  const nestedPath = relative(repoRoot, normalizedCwd)
  const existingWorktree = (await listGitWorktrees(normalizedCwd)).find(
    (item) => item.branch === branch,
  )
  const worktreeRoot =
    existingWorktree?.path ?? resolveAutoWorktreePath(repoKey, branch)
  if (!existingWorktree) {
    const branchRef = await runGitCapture(normalizedCwd, [
      'rev-parse',
      '--verify',
      `refs/heads/${branch}^{commit}`,
    ])
    await execFileAsync(
      'git',
      branchRef
        ? ['worktree', 'add', worktreeRoot, branch]
        : ['worktree', 'add', '-b', branch, worktreeRoot, 'HEAD'],
      {
        cwd: normalizedCwd,
        encoding: 'utf8',
      },
    )
  }
  const resolvedWorktreeRoot = await tryResolveRealpath(worktreeRoot)
  if (nestedPath.length === 0) return resolvedWorktreeRoot
  return join(resolvedWorktreeRoot, nestedPath)
}

export const resolveTaskExecutionTarget = async (
  cwd: string,
  branchOverride?: string,
): Promise<TaskExecutionTarget> => {
  const resolvedCwd = resolve(expandHomeDir(cwd))
  const normalizedCwd = await tryResolveRealpath(resolvedCwd)
  const repoKey = await resolveRepoKey(normalizedCwd)
  const branch = repoKey
    ? (branchOverride ?? (await resolveBranch(normalizedCwd)))
    : undefined
  return {
    cwd: normalizedCwd,
    ...(repoKey ? { repoKey } : {}),
    ...(repoKey && branch ? { branch } : {}),
  }
}

export const buildTaskDispatchLockKey = (target: {
  cwd: string
  repoKey?: string | undefined
  branch?: string | undefined
}): string =>
  target.repoKey && target.branch
    ? `git:${target.repoKey}#${target.branch}`
    : `cwd:${target.cwd}`
