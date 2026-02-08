import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { safe } from '../log/safe.js'

import type { Dirent } from 'node:fs'

export type StatePaths = {
  root: string
  channels: string
  history: string
  log: string
  userInputChannel: string
  workerResultChannel: string
  tellerDigestChannel: string
  thinkerDecisionChannel: string
}

export const buildPaths = (stateDir: string): StatePaths => {
  const root = stateDir
  const channels = join(root, 'channels')
  return {
    root,
    channels,
    history: join(root, 'history.jsonl'),
    log: join(root, 'log.jsonl'),
    userInputChannel: join(channels, 'user-input.jsonp'),
    workerResultChannel: join(channels, 'worker-result.jsonp'),
    tellerDigestChannel: join(channels, 'teller-digest.jsonp'),
    thinkerDecisionChannel: join(channels, 'thinker-decision.jsonp'),
  }
}

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true })
}

export const ensureStateDirs = async (paths: StatePaths): Promise<void> => {
  await ensureDir(paths.root)
  await ensureDir(paths.channels)
}

export const listFiles = (dir: string): Promise<Dirent[]> =>
  safe('listFiles: readdir', () => readdir(dir, { withFileTypes: true }), {
    fallback: [],
    meta: { dir },
    ignoreCodes: ['ENOENT'],
  })
