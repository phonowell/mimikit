import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { BeadsConfig, BeadsMode } from './types.js'

const hasBeadsDir = async (workDir: string): Promise<boolean> => {
  try {
    const info = await stat(join(workDir, '.beads'))
    return info.isDirectory()
  } catch {
    return false
  }
}

export const resolveBeadsConfig = async (
  workDir: string,
): Promise<BeadsConfig | null> => {
  const mode: BeadsMode = 'auto'
  if (!(await hasBeadsDir(workDir))) return null
  const worktree = false
  const bin = 'bd'
  const extraArgs: string[] = []
  const readyLimit = 10
  const noDaemon = false
  return {
    workDir,
    mode,
    bin,
    extraArgs,
    readyLimit,
    worktree,
    noDaemon,
  }
}
