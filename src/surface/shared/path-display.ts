import { isAbsolute, relative, resolve } from 'node:path'

export const toStateDisplayPath = (path: string): string | undefined => {
  const normalized = path.trim().replace(/\\/g, '/')
  if (!normalized) return undefined
  if (normalized.startsWith('.mimikit/')) return normalized
  const match = normalized.match(/(?:^|\/)(\.mimikit\/.+)$/)
  return match?.[1]
}

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
