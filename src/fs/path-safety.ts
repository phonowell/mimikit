import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { readErrorCode } from '../shared/error-code.js'

export type ExistingPathBoundary = 'inside' | 'outside' | 'missing'

export const isPathInsideRoot = (
  rootPath: string,
  targetPath: string,
): boolean => {
  const rel = relative(rootPath, targetPath)
  if (!rel) return true
  if (rel.startsWith('..')) return false
  return !isAbsolute(rel)
}

export const resolveFromRoot = (rootPath: string, path: string): string => {
  if (isAbsolute(path)) return resolve(path)
  return resolve(rootPath, path)
}

export const toPathWithinRoot = (
  rootPath: string,
  targetPath: string,
): string | undefined => {
  const rel = relative(rootPath, targetPath)
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined
  return rel
}

export const checkExistingPathBoundary = async (params: {
  rootPath: string
  targetPath: string
}): Promise<ExistingPathBoundary> => {
  const rootResolved = resolve(params.rootPath)
  const targetResolved = resolve(params.targetPath)

  if (!isPathInsideRoot(rootResolved, targetResolved)) return 'outside'

  const rootReal = await realpath(rootResolved)
  try {
    const targetReal = await realpath(targetResolved)
    return isPathInsideRoot(rootReal, targetReal) ? 'inside' : 'outside'
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return 'missing'
    throw error
  }
}
