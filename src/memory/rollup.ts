import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { execCodex } from '../codex.js'

import { formatTimestamp } from './write.js'

type RollupState = {
  daily?: Record<string, string>
  monthly?: Record<string, string>
  lastRunAt?: string
}

export type RollupResult = {
  dailySummaries: number
  monthlySummaries: number
}

const MS_DAY = 24 * 60 * 60 * 1000
const DAILY_MIN_AGE_DAYS = 5
const DAILY_MAX_AGE_DAYS = 90

const rollupStatePath = (stateDir: string): string =>
  join(stateDir, 'memory_rollup.json')

export const readMemoryRollupState = async (
  stateDir: string,
): Promise<RollupState> => {
  try {
    const data = await readFile(rollupStatePath(stateDir), 'utf-8')
    return JSON.parse(data) as RollupState
  } catch {
    return {}
  }
}

const writeRollupState = async (
  stateDir: string,
  state: RollupState,
): Promise<void> => {
  await writeFile(rollupStatePath(stateDir), JSON.stringify(state, null, 2))
}

const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true })
}

const safeStat = async (path: string): Promise<boolean> => {
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

const parseMonthFromDay = (day: string): string | null => {
  const match = day.match(/^(\d{4}-\d{2})-\d{2}$/)
  return match ? (match[1] ?? null) : null
}

const listSessionFilesByDay = async (
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

const listDailySummaries = async (
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

const loadFiles = async (paths: string[]): Promise<string> => {
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

const summarize = async (params: {
  prompt: string
  workDir: string
  model?: string | undefined
}): Promise<string> => {
  const result = await execCodex({
    prompt: params.prompt,
    workDir: params.workDir,
    model: params.model,
    timeout: 10 * 60 * 1000,
  })
  return result.output.trim()
}

const buildDailyPrompt = (day: string, content: string): string =>
  [
    'You are summarizing conversation logs.',
    `Date: ${day}`,
    'Write a concise markdown summary with bullet points.',
    'Focus on decisions, tasks, open issues, and key facts.',
    'No preface, no code fences, no headings.',
    '',
    content,
  ].join('\n')

const buildMonthlyPrompt = (month: string, content: string): string =>
  [
    'You are summarizing daily summaries into a monthly summary.',
    `Month: ${month}`,
    'Write a concise markdown summary with bullet points.',
    'Focus on decisions, tasks, open issues, and key facts.',
    'No preface, no code fences, no headings.',
    '',
    content,
  ].join('\n')

const ageInDays = (now: number, date: string): number => {
  const ts = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ts)) return 0
  return Math.floor((now - ts) / MS_DAY)
}

const writeDailySummary = async (params: {
  workDir: string
  day: string
  summary: string
  sources: string[]
}): Promise<string> => {
  const dir = join(params.workDir, 'memory', 'summary')
  await ensureDir(dir)
  const path = join(dir, `${params.day}.md`)
  const header = [
    `# Summary: ${params.day}`,
    `- generated: ${formatTimestamp(new Date())}`,
    `- sources: ${params.sources.map((src) => src.replace(`${params.workDir}/`, '')).join(', ')}`,
    '',
  ].join('\n')
  await writeFile(path, `${header}${params.summary}\n`)
  return path
}

const writeMonthlySummary = async (params: {
  workDir: string
  month: string
  summary: string
  sources: string[]
}): Promise<string> => {
  const dir = join(params.workDir, 'memory', 'summary')
  await ensureDir(dir)
  const path = join(dir, `${params.month}.md`)
  const header = [
    `# Summary: ${params.month}`,
    `- generated: ${formatTimestamp(new Date())}`,
    `- sources: ${params.sources.map((src) => src.replace(`${params.workDir}/`, '')).join(', ')}`,
    '',
  ].join('\n')
  await writeFile(path, `${header}${params.summary}\n`)
  return path
}

export const runMemoryRollup = async (params: {
  stateDir: string
  workDir: string
  model?: string | undefined
  now?: Date | undefined
}): Promise<RollupResult> => {
  const now = params.now ?? new Date()
  const nowMs = now.getTime()
  const state = await readMemoryRollupState(params.stateDir)
  const dailyState = state.daily ?? {}
  const monthlyState = state.monthly ?? {}
  let dailyCount = 0
  let monthlyCount = 0

  const sessionFiles = await listSessionFilesByDay(params.workDir)
  const dailySummaries = await listDailySummaries(params.workDir)

  for (const [day, files] of sessionFiles) {
    const age = ageInDays(nowMs, day)
    if (age < DAILY_MIN_AGE_DAYS || age > DAILY_MAX_AGE_DAYS) continue
    if (dailyState[day]) continue
    if (dailySummaries.has(day)) {
      dailyState[day] = formatTimestamp(now)
      continue
    }
    const content = await loadFiles(files)
    if (!content.trim()) continue
    const prompt = buildDailyPrompt(day, content)
    const summary = await summarize({
      prompt,
      workDir: params.workDir,
      model: params.model,
    })
    await writeDailySummary({
      workDir: params.workDir,
      day,
      summary,
      sources: files,
    })
    dailyState[day] = formatTimestamp(now)
    dailyCount += 1
  }

  const updatedDailySummaries = await listDailySummaries(params.workDir)
  const monthlySources = new Map<string, string[]>()
  const addMonthlySources = (month: string, paths: string[]) => {
    const list = monthlySources.get(month) ?? []
    for (const path of paths) if (!list.includes(path)) list.push(path)

    monthlySources.set(month, list)
  }
  for (const [day, path] of updatedDailySummaries) {
    const age = ageInDays(nowMs, day)
    if (age <= DAILY_MAX_AGE_DAYS) continue
    const month = parseMonthFromDay(day)
    if (!month) continue
    addMonthlySources(month, [path])
  }
  for (const [day, files] of sessionFiles) {
    const age = ageInDays(nowMs, day)
    if (age <= DAILY_MAX_AGE_DAYS) continue
    if (updatedDailySummaries.has(day)) continue
    const month = parseMonthFromDay(day)
    if (!month) continue
    addMonthlySources(month, files)
  }

  const summaryDir = join(params.workDir, 'memory', 'summary')
  for (const [month, sources] of monthlySources) {
    if (monthlyState[month]) continue
    const monthPath = join(summaryDir, `${month}.md`)
    if (await safeStat(monthPath)) {
      monthlyState[month] = formatTimestamp(now)
      continue
    }
    const content = await loadFiles(sources)
    if (!content.trim()) continue
    const prompt = buildMonthlyPrompt(month, content)
    const summary = await summarize({
      prompt,
      workDir: params.workDir,
      model: params.model,
    })
    await writeMonthlySummary({
      workDir: params.workDir,
      month,
      summary,
      sources,
    })
    monthlyState[month] = formatTimestamp(now)
    monthlyCount += 1
  }

  const nextState: RollupState = {
    daily: dailyState,
    monthly: monthlyState,
    lastRunAt: formatTimestamp(now),
  }
  await writeRollupState(params.stateDir, nextState)
  return { dailySummaries: dailyCount, monthlySummaries: monthlyCount }
}
