import { join } from 'node:path'

import { DAILY_MAX_AGE_DAYS, DAILY_MIN_AGE_DAYS } from './rollup-constants.js'
import {
  ageInDays,
  listDailySummaries,
  listSessionFilesByDay,
  loadFiles,
  parseMonthFromDay,
  safeStat,
} from './rollup-files.js'
import {
  buildDailyPrompt,
  buildMonthlyPrompt,
  summarize,
} from './rollup-prompts.js'
import {
  readMemoryRollupState,
  type RollupState,
  writeMemoryRollupState,
} from './rollup-state.js'
import { writeDailySummary, writeMonthlySummary } from './rollup-write.js'
import { formatTimestamp } from './write.js'

export type RollupResult = {
  dailySummaries: number
  monthlySummaries: number
}

export { readMemoryRollupState } from './rollup-state.js'

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
  await writeMemoryRollupState(params.stateDir, nextState)
  return { dailySummaries: dailyCount, monthlySummaries: monthlyCount }
}
