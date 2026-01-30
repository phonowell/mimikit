import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { Dirent } from 'node:fs'

export type MemoryFileEntry = {
  path: string
  kind: 'memory' | 'summary' | 'docs' | 'longterm'
}

const MS_DAY = 24 * 60 * 60 * 1000

const isFile = async (path: string): Promise<boolean> => {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

const parseDay = (name: string): string | null => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})(?:-.*)?\.md$/)
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

const ageInDays = (nowMs: number, date: string): number => {
  const ts = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ts)) return 0
  return Math.floor((nowMs - ts) / MS_DAY)
}

const monthAgeInDays = (nowMs: number, month: string): number => {
  const ts = Date.parse(`${month}-01T00:00:00Z`)
  if (!Number.isFinite(ts)) return 0
  return Math.floor((nowMs - ts) / MS_DAY)
}

const walkMarkdown = async (dir: string): Promise<string[]> => {
  const results: string[] = []
  let entries: Dirent[] = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkMarkdown(full)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) results.push(full)
  }
  return results
}

export const listSearchFiles = async (params: {
  workDir: string
  now?: Date | undefined
}): Promise<MemoryFileEntry[]> => {
  const now = params.now ?? new Date()
  const nowMs = now.getTime()
  const results: MemoryFileEntry[] = []

  const memoryDir = join(params.workDir, 'memory')
  const summaryDir = join(memoryDir, 'summary')
  const docsDir = join(params.workDir, 'docs')
  const longTerm = join(params.workDir, 'MEMORY.md')

  if (await isFile(longTerm)) results.push({ path: longTerm, kind: 'longterm' })

  // Raw memory files: keep last 5 days
  let memoryEntries: string[] = []
  try {
    memoryEntries = await readdir(memoryDir)
  } catch {
    memoryEntries = []
  }
  for (const name of memoryEntries) {
    if (name === 'summary') continue
    if (!name.endsWith('.md')) continue
    const day = parseDay(name)
    if (!day) continue
    const age = ageInDays(nowMs, day)
    if (age <= 5) results.push({ path: join(memoryDir, name), kind: 'memory' })
  }

  // Summary files: include daily (5-90d) and monthly (>90d)
  let summaryEntries: string[] = []
  try {
    summaryEntries = await readdir(summaryDir)
  } catch {
    summaryEntries = []
  }
  for (const name of summaryEntries) {
    if (!name.endsWith('.md')) continue
    const day = parseSummaryDay(name)
    if (day) {
      const age = ageInDays(nowMs, day)
      if (age >= 5 && age <= 90)
        results.push({ path: join(summaryDir, name), kind: 'summary' })

      continue
    }
    const month = parseSummaryMonth(name)
    if (month) {
      const age = monthAgeInDays(nowMs, month)
      if (age > 90)
        results.push({ path: join(summaryDir, name), kind: 'summary' })
    }
  }

  // Docs
  const docs = await walkMarkdown(docsDir)
  for (const path of docs) results.push({ path, kind: 'docs' })

  return results
}
