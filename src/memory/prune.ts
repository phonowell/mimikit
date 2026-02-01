import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export type MemoryRetentionPolicy = {
  recentDays: number
  summaryDays: number
  keepLongTerm: boolean
}

export type PruneResult = {
  removed: string[]
  kept: string[]
}

const parseDay = (name: string): string | null => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})-.*\.md$/)
  return match ? (match[1] ?? null) : null
}

const parseSummaryDay = (name: string): string | null => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
  return match ? (match[1] ?? null) : null
}

const parseSummaryMonth = (name: string): string | null => {
  const match = name.match(/^(\d{4}-\d{2})\.md$/)
  return match ? (match[1] ?? null) : null
}

const dayMs = 24 * 60 * 60 * 1000

export const pruneMemory = async (params: {
  stateDir: string
  policy: MemoryRetentionPolicy
  now?: Date
  dryRun?: boolean
}): Promise<PruneResult> => {
  const now = params.now ?? new Date()
  const cutoffRecent = now.getTime() - params.policy.recentDays * dayMs
  const cutoffSummary = now.getTime() - params.policy.summaryDays * dayMs
  const removed: string[] = []
  const kept: string[] = []

  const memoryDir = join(params.stateDir, 'memory')
  const summaryDir = join(memoryDir, 'summary')
  const longTerm = join(params.stateDir, 'memory.md')

  if (!params.policy.keepLongTerm) {
    try {
      await stat(longTerm)
      if (!params.dryRun) await unlink(longTerm)
      removed.push(longTerm)
    } catch {
      // ignore
    }
  } else kept.push(longTerm)

  let memoryEntries: string[] = []
  try {
    memoryEntries = await readdir(memoryDir)
  } catch {
    memoryEntries = []
  }
  for (const name of memoryEntries) {
    if (name === 'summary' || !name.endsWith('.md')) continue
    const day = parseDay(name)
    if (!day) continue
    const dateMs = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(dateMs)) continue
    const fullPath = join(memoryDir, name)
    if (dateMs < cutoffRecent) {
      if (!params.dryRun) await unlink(fullPath).catch(() => undefined)
      removed.push(fullPath)
    } else kept.push(fullPath)
  }

  let summaryEntries: string[] = []
  try {
    summaryEntries = await readdir(summaryDir)
  } catch {
    summaryEntries = []
  }
  for (const name of summaryEntries) {
    if (!name.endsWith('.md')) continue
    const day = parseSummaryDay(name)
    const month = day ? null : parseSummaryMonth(name)
    const dateStr = day ?? (month ? `${month}-01` : null)
    if (!dateStr) continue
    const dateMs = Date.parse(`${dateStr}T00:00:00Z`)
    if (!Number.isFinite(dateMs)) continue
    const fullPath = join(summaryDir, name)
    if (dateMs < cutoffSummary) {
      if (!params.dryRun) await unlink(fullPath).catch(() => undefined)
      removed.push(fullPath)
    } else kept.push(fullPath)
  }

  return { removed, kept }
}
