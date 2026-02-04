import { rm } from 'node:fs/promises'
import { parse, resolve } from 'node:path'

import { ensureDir } from '../fs/ensure.js'

const isSafeStateDir = (stateDir: string): boolean => {
  const trimmed = stateDir.trim()
  if (!trimmed) return false
  const resolved = resolve(stateDir)
  const { root } = parse(resolved)
  if (!root) return false
  return resolved !== root
}

export const clearStateDir = async (stateDir: string): Promise<void> => {
  const resolved = resolve(stateDir)
  if (!isSafeStateDir(resolved))
    throw new Error(`refusing to clear unsafe state dir: ${resolved}`)

  await rm(resolved, { recursive: true, force: true })
  await ensureDir(resolved)
}
