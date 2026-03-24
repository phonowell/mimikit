import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

import { nowIso } from '../../foundation/shared/utils.js'

import type { RuntimeStartupInfo } from '../../kernel/shared/runtime-startup.js'

const readGitText = (cwd: string, args: string[]): string | undefined => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.error || result.status !== 0) return undefined
  const output = result.stdout.trim()
  return output.length > 0 ? output : undefined
}

export const resolveRuntimeStartupInfo = (
  worktreeHint = process.cwd(),
): RuntimeStartupInfo => {
  const cwd = resolve(worktreeHint)
  const worktree = readGitText(cwd, ['rev-parse', '--show-toplevel']) ?? cwd
  const commit = readGitText(worktree, ['rev-parse', 'HEAD'])
  const dirtyOutput = readGitText(worktree, ['status', '--porcelain'])

  return {
    startedAt: nowIso(),
    worktree,
    ...(commit ? { commit } : {}),
    ...(dirtyOutput !== undefined ? { dirty: dirtyOutput.length > 0 } : {}),
  }
}
