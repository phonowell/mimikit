import { runVerifyCommand } from './verify.js'

export type DiffSummary = {
  changedFiles: number
  added: number
  removed: number
  total: number
}

const parseNumstat = (text: string): { added: number; removed: number } => {
  let added = 0
  let removed = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const [rawAdded, rawRemoved] = line.split('\t')
    const addValue =
      rawAdded && rawAdded !== '-' ? Number.parseInt(rawAdded, 10) : 0
    const removeValue =
      rawRemoved && rawRemoved !== '-' ? Number.parseInt(rawRemoved, 10) : 0
    if (Number.isFinite(addValue)) added += addValue
    if (Number.isFinite(removeValue)) removed += removeValue
  }
  return { added, removed }
}

const parseStatusFiles = (text: string): number => {
  const files = new Set<string>()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const rawPath = line.slice(3).trim()
    if (!rawPath) continue
    const path = rawPath.includes(' -> ')
      ? rawPath.split(' -> ').pop()
      : rawPath
    if (path) files.add(path)
  }
  return files.size
}

export const isCleanRepo = async (
  cwd: string,
  timeoutMs: number,
): Promise<boolean> => {
  const result = await runVerifyCommand('git status --porcelain', {
    cwd,
    timeoutMs,
  })
  if (!result.ok) throw new Error(result.error ?? 'git status failed')
  return result.stdout.trim().length === 0
}

export const getDiffSummary = async (
  cwd: string,
  timeoutMs: number,
): Promise<DiffSummary> => {
  const status = await runVerifyCommand('git status --porcelain', {
    cwd,
    timeoutMs,
  })
  if (!status.ok) throw new Error(status.error ?? 'git status failed')
  const diff = await runVerifyCommand('git diff --numstat', {
    cwd,
    timeoutMs,
  })
  if (!diff.ok) throw new Error(diff.error ?? 'git diff failed')

  const { added, removed } = parseNumstat(diff.stdout)
  const changedFiles = parseStatusFiles(status.stdout)

  return { changedFiles, added, removed, total: added + removed }
}
