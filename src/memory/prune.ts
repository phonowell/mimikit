import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { safe } from '../log/safe.js'

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
    const exists = await safe(
      'pruneMemory: stat longterm',
      async () => {
        await stat(longTerm)
        return true
      },
      { fallback: false, meta: { path: longTerm }, ignoreCodes: ['ENOENT'] },
    )
    if (exists) {
      if (!params.dryRun) {
        await safe('pruneMemory: unlink longterm', () => unlink(longTerm), {
          fallback: undefined,
          meta: { path: longTerm },
          ignoreCodes: ['ENOENT'],
        })
      }
      removed.push(longTerm)
    }
  } else kept.push(longTerm)

  const memoryEntries = await safe(
    'pruneMemory: readdir memory',
    () => readdir(memoryDir),
    { fallback: [], meta: { path: memoryDir }, ignoreCodes: ['ENOENT'] },
  )
  for (const name of memoryEntries) {
    if (name === 'summary' || !name.endsWith('.md')) continue
    const day = parseDay(name)
    if (!day) continue
    const dateMs = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(dateMs)) continue
    const fullPath = join(memoryDir, name)
    if (dateMs < cutoffRecent) {
      if (!params.dryRun) {
        await safe('pruneMemory: unlink', () => unlink(fullPath), {
          fallback: undefined,
          meta: { path: fullPath },
          ignoreCodes: ['ENOENT'],
        })
      }
      removed.push(fullPath)
    } else kept.push(fullPath)
  }

  const summaryEntries = await safe(
    'pruneMemory: readdir summary',
    () => readdir(summaryDir),
    { fallback: [], meta: { path: summaryDir }, ignoreCodes: ['ENOENT'] },
  )
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
      if (!params.dryRun) {
        await safe('pruneMemory: unlink summary', () => unlink(fullPath), {
          fallback: undefined,
          meta: { path: fullPath },
          ignoreCodes: ['ENOENT'],
        })
      }
      removed.push(fullPath)
    } else kept.push(fullPath)
  }

  return { removed, kept }
}
