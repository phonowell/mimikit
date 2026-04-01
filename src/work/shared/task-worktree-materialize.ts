import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  expandHomeDir,
  resolveBranch,
  resolveRepoKey,
  resolveRepoRoot,
  runGitCapture,
  tryResolveRealpath,
} from './task-execution-target.js'
import { validateMappedWorktreeCwd } from './task-worktree-mapped-cwd.js'

const execFileAsync = promisify(execFile)

export type MaterializeTaskWorktreeCwdResult =
  | {
      ok: true
      cwd: string
    }
  | {
      ok: false
      detail: string
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
  const repoRoot = repoKey.replace(/\/?\.git$/, '')
  const branchKey = createHash('sha1').update(branch).digest('hex').slice(0, 8)
  return join(
    repoRoot,
    '.worktrees',
    `${sanitizeBranchForPath(branch)}-${branchKey}`,
  )
}

const normalizeWorktreePrepareFailureDetail = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'stderr' in error &&
    typeof error.stderr === 'string'
  ) {
    const stderr = error.stderr.trim()
    if (stderr.length > 0) return stderr.replace(/\s+/g, ' ')
  }
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) return message.replace(/\s+/g, ' ')
  }
  return 'git worktree add failed'
}

export const materializeTaskWorktreeCwd = async (
  cwd: string,
  branch: string,
): Promise<MaterializeTaskWorktreeCwdResult> => {
  const resolvedCwd = resolve(expandHomeDir(cwd))
  const normalizedCwd = await tryResolveRealpath(resolvedCwd)
  const [repoRoot, repoKey, currentBranch] = await Promise.all([
    resolveRepoRoot(normalizedCwd),
    resolveRepoKey(normalizedCwd),
    resolveBranch(normalizedCwd),
  ])
  if (!repoRoot || !repoKey) {
    return {
      ok: false,
      detail: '`cwd` 不在 git 仓库内，无法按 branch 自动准备 worktree。',
    }
  }
  if (currentBranch === branch) return { ok: true, cwd: normalizedCwd }

  const nestedPath = relative(repoRoot, normalizedCwd)
  const autoWorktreeRoot = resolveAutoWorktreePath(repoKey, branch)
  const existingWorktree = (await listGitWorktrees(normalizedCwd)).find(
    (item) => item.branch === branch,
  )
  if (
    existingWorktree &&
    resolve(existingWorktree.path) !== resolve(autoWorktreeRoot)
  ) {
    return {
      ok: false,
      detail: `branch "${branch}" 已绑定旧 worktree ${existingWorktree.path}；当前只接受 repo-local .worktrees 路径 ${autoWorktreeRoot}。请先清理旧 worktree 后重试。`,
    }
  }
  const worktreeRoot = existingWorktree?.path ?? autoWorktreeRoot
  if (!existingWorktree) {
    await mkdir(join(repoRoot, '.worktrees'), { recursive: true })
    const normalizedBranch = await runGitCapture(normalizedCwd, [
      'check-ref-format',
      '--branch',
      branch,
    ])
    if (!normalizedBranch) {
      return {
        ok: false,
        detail: `branch "${branch}" 不是合法 git 分支名。`,
      }
    }
    const branchRef = await runGitCapture(normalizedCwd, [
      'rev-parse',
      '--verify',
      `refs/heads/${branch}^{commit}`,
    ])
    try {
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
    } catch (error) {
      return {
        ok: false,
        detail: normalizeWorktreePrepareFailureDetail(error),
      }
    }
  }
  const resolvedWorktreeRoot = await tryResolveRealpath(worktreeRoot)
  if (nestedPath.length === 0) return { ok: true, cwd: resolvedWorktreeRoot }
  const mappedCwd = join(resolvedWorktreeRoot, nestedPath)
  const mappedValidation = await validateMappedWorktreeCwd({
    originalCwd: normalizedCwd,
    nestedPath,
    mappedCwd,
  })
  if (!mappedValidation.ok) {
    return {
      ok: false,
      detail: mappedValidation.detail,
    }
  }
  return { ok: true, cwd: mappedCwd }
}
