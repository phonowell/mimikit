import { isAbsolute, relative, resolve } from 'node:path'

export const isWildcardQuery = (query: string): boolean => query.trim() === '*'

export const toDisplayPath = (path: string, workDir: string): string => {
  const trimmedPath = path.trim()
  if (!trimmedPath) return trimmedPath
  const resolvedWorkDir = resolve(workDir)
  const resolvedPath = isAbsolute(trimmedPath)
    ? resolve(trimmedPath)
    : resolve(resolvedWorkDir, trimmedPath)
  const rel = relative(resolvedWorkDir, resolvedPath)
  if (!rel) return '.'
  if (rel.startsWith('..') || isAbsolute(rel)) return trimmedPath
  return rel
}
