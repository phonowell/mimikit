import { join } from 'node:path'

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
