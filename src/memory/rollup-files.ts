import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { MS_DAY } from './rollup-constants.js'

export const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true })
}

export const safeStat = async (path: string): Promise<boolean> => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const parseDayFromName = (name: string): string | null => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})(?:-.*)?\.md$/)
  if (!match) return null
  return match[1] ?? null
}

const parseDayFromSummary = (name: string): string | null => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
  if (!match) return null
  return match[1] ?? null
}

export const parseMonthFromDay = (day: string): string | null => {
  const match = day.match(/^(\d{4}-\d{2})-\d{2}$/)
  return match ? (match[1] ?? null) : null
}

export const listSessionFilesByDay = async (
  workDir: string,
): Promise<Map<string, string[]>> => {
  const dir = join(workDir, 'memory')
  const results = new Map<string, string[]>()
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return results
  }
  for (const name of entries) {
    if (name === 'summary') continue
    if (!name.endsWith('.md')) continue
    const day = parseDayFromName(name)
    if (!day) continue
    const list = results.get(day) ?? []
    list.push(join(dir, name))
    results.set(day, list)
  }
  return results
}

export const listDailySummaries = async (
  workDir: string,
): Promise<Map<string, string>> => {
  const dir = join(workDir, 'memory', 'summary')
  const results = new Map<string, string>()
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return results
  }
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    if (name.length === 10 + 3) {
      const day = parseDayFromSummary(name)
      if (!day) continue
      results.set(day, join(dir, name))
    }
  }
  return results
}

export const loadFiles = async (paths: string[]): Promise<string> => {
  const chunks: string[] = []
  for (const path of paths) {
    try {
      const content = await readFile(path, 'utf-8')
      chunks.push(`\n---\n# ${path}\n${content}`)
    } catch {
      // ignore unreadable
    }
  }
  return chunks.join('\n')
}

export const ageInDays = (now: number, date: string): number => {
  const ts = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ts)) return 0
  return Math.floor((now - ts) / MS_DAY)
}
