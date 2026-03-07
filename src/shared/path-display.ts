import { isAbsolute, relative, resolve } from 'node:path'

export const toDisplayPath = (path: string, workDir?: string): string => {
  const trimmedPath = path.trim()
  if (!workDir) return trimmedPath
  const trimmedWorkDir = workDir.trim()
  if (!trimmedWorkDir) return trimmedPath
  const resolvedWorkDir = resolve(trimmedWorkDir)
  const resolvedPath = isAbsolute(trimmedPath)
    ? resolve(trimmedPath)
    : resolve(resolvedWorkDir, trimmedPath)
  const rel = relative(resolvedWorkDir, resolvedPath)
  if (!rel) return '.'
  if (rel.startsWith('..') || isAbsolute(rel)) return trimmedPath
  return rel
}
