import { toDisplayPath as toRelativeDisplayPath } from '../shared/path-display.js'

export const isWildcardQuery = (query: string): boolean => query.trim() === '*'

export const toDisplayPath = (path: string, workDir: string): string =>
  toRelativeDisplayPath(path, workDir)
