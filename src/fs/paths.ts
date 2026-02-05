import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { safe } from '../log/safe.js'

import type { Dirent } from 'node:fs'

export type StatePaths = {
  root: string
  history: string
  log: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  return {
    root,
    history: join(root, 'history.jsonl'),
    log: join(root, 'log.jsonl'),
  }
}

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true })
}

export const ensureStateDirs = async (paths: StatePaths): Promise<void> => {
  await ensureDir(paths.root)
}

export const listFiles = (dir: string): Promise<Dirent[]> =>
  safe('listFiles: readdir', () => readdir(dir, { withFileTypes: true }), {
    fallback: [],
    meta: { dir },
    ignoreCodes: ['ENOENT'],
  })
