import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
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
