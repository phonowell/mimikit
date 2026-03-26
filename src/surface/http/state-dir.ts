import { readdir, rm } from 'node:fs/promises'
import { basename, join, parse, resolve } from 'node:path'

import { ensureDir } from '../../persistence/fs/paths.js'

const PRESERVED_STATE_ENTRY_NAMES = new Set(['.instance', '.instance.lock'])

const isSafeStateDir = (stateDir: string): boolean => {
  const trimmed = stateDir.trim()
  if (!trimmed) return false
  const resolved = resolve(stateDir)
  const { root } = parse(resolved)
  if (!root) return false
  return resolved !== root && basename(resolved) === '.mimikit'
}

export const clearStateDir = async (stateDir: string): Promise<void> => {
  const resolved = resolve(stateDir)
  if (!isSafeStateDir(resolved))
    throw new Error(`refusing to clear unsafe state dir: ${resolved}`)

  await ensureDir(resolved)
  const entries = await readdir(resolved, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => !PRESERVED_STATE_ENTRY_NAMES.has(entry.name))
      .map((entry) =>
        rm(join(resolved, entry.name), { recursive: true, force: true }),
      ),
  )
}
