import { isAbsolute, relative, resolve } from 'node:path'

import { parseIsoToMs } from '../shared/time.js'

import type { QueryContextRequest } from './query-context-schema.js'

export const isWildcardQuery = (query: string): boolean => query.trim() === '*'

export const inRange = (
  value: string,
  request: QueryContextRequest,
): boolean => {
  const ms = parseIsoToMs(value)
  if (request.fromMs !== undefined && ms < request.fromMs) return false
  if (request.toMs !== undefined && ms > request.toMs) return false
  return true
}

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
