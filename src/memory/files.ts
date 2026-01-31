import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export type MemoryFile = {
  path: string
  kind: 'memory' | 'summary' | 'longterm'
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

const daysBetween = (a: Date, b: Date): number =>
  Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))

export const listMemoryFiles = async (params: {
  stateDir: string
  now?: Date
}): Promise<MemoryFile[]> => {
  const now = params.now ?? new Date()
  const results: MemoryFile[] = []
  const memoryDir = join(params.stateDir, 'memory')
  const summaryDir = join(memoryDir, 'summary')
  const longTerm = join(params.stateDir, 'memory.md')

  try {
    await import('node:fs/promises').then((fs) => fs.stat(longTerm))
    results.push({ path: longTerm, kind: 'longterm' })
  } catch {
    // ignore
  }

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
    const age = daysBetween(now, new Date(`${day}T00:00:00Z`))
    if (age <= 5) results.push({ path: join(memoryDir, name), kind: 'memory' })
  }

  let summaryEntries: string[] = []
  try {
    summaryEntries = await readdir(summaryDir)
  } catch {
    summaryEntries = []
  }
  const monthly = new Set<string>()
  const daily: Array<{ day: string; path: string }> = []
  for (const name of summaryEntries) {
    if (!name.endsWith('.md')) continue
    const month = parseSummaryMonth(name)
    if (month) {
      monthly.add(month)
      results.push({ path: join(summaryDir, name), kind: 'summary' })
      continue
    }
    const day = parseSummaryDay(name)
    if (day) daily.push({ day, path: join(summaryDir, name) })
  }
  for (const item of daily) {
    const month = item.day.slice(0, 7)
    if (!monthly.has(month)) results.push({ path: item.path, kind: 'summary' })
  }

  return results
}
