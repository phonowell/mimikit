import { rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { runGitRestore, runGitStatus } from './code-evolve-process.js'

import type { GitChanges } from './code-evolve-types.js'

const normalizeGitPath = (
  line: string,
): { path: string; untracked: boolean } | null => {
  if (line.length < 4) return null
  const status = line.slice(0, 2)
  const rawPath = line.slice(3).trim()
  const path = rawPath.includes(' -> ')
    ? (rawPath.split(' -> ').at(-1)?.trim() ?? '')
    : rawPath
  if (!path) return null
  return { path, untracked: status === '??' }
}

export const listGitChanges = async (workDir: string): Promise<GitChanges> => {
  const status = await runGitStatus(workDir)
  if (!status.ok) return { tracked: [], untracked: [] }
  const lines = status.stdout
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .filter((item) => item.length > 0)
  const tracked: string[] = []
  const untracked: string[] = []
  for (const line of lines) {
    const parsed = normalizeGitPath(line)
    if (!parsed) continue
    if (parsed.untracked) untracked.push(parsed.path)
    else tracked.push(parsed.path)
  }
  return { tracked, untracked }
}

const subtractPaths = (after: string[], before: string[]): string[] => {
  if (after.length === 0) return []
  const baseline = new Set(before)
  return after.filter((path) => !baseline.has(path))
}

export const diffGitChanges = (params: {
  before: GitChanges
  after: GitChanges
}): GitChanges => ({
  tracked: subtractPaths(params.after.tracked, params.before.tracked),
  untracked: subtractPaths(params.after.untracked, params.before.untracked),
})

export const onlyContainsAllowedDirtyPaths = (params: {
  changes: GitChanges
  allowDirtyPaths: string[]
}): boolean => {
  if (params.changes.untracked.length > 0) return false
  if (params.changes.tracked.length === 0) return true
  const allow = new Set(params.allowDirtyPaths)
  return params.changes.tracked.every((path) => allow.has(path))
}

export const rollbackChanges = async (params: {
  workDir: string
  changes: GitChanges
}): Promise<void> => {
  await runGitRestore(params.workDir, params.changes.tracked)
  for (const file of params.changes.untracked) {
    const fullPath = resolve(params.workDir, file)
    const rel = relative(params.workDir, fullPath)
    if (rel.startsWith('..') || isAbsolute(rel)) continue
    await rm(fullPath, { recursive: true, force: true })
  }
}
