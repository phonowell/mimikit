import { appendLog } from '../log/append.js'
import {
  applyHistoryLimits,
  archiveHistory,
  shouldArchive,
} from '../memory/archive.js'
import { loadTemplate } from '../memory/templates.js'
import { readHistory, writeHistory } from '../storage/history.js'

import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { HistoryMessage } from '../types/history.js'

const estimateBytes = (history: HistoryMessage[]): number =>
  Buffer.byteLength(JSON.stringify(history), 'utf8')

const exceedsLimits = (params: {
  history: HistoryMessage[]
  hardCount: number
  hardBytes: number
}): boolean => {
  if (params.history.length > params.hardCount) return true
  return estimateBytes(params.history) > params.hardBytes
}

const trimArchived = (params: {
  history: HistoryMessage[]
  hardCount: number
  hardBytes: number
}): HistoryMessage[] => {
  let next = [...params.history]
  while (
    exceedsLimits({
      history: next,
      hardCount: params.hardCount,
      hardBytes: params.hardBytes,
    })
  ) {
    const idx = next.findIndex((msg) => msg.archived === true)
    if (idx === -1) break
    next = [...next.slice(0, idx), ...next.slice(idx + 1)]
  }
  return next
}

export const maintainHistory = async (params: {
  paths: StatePaths
  config: SupervisorConfig
}) => {
  const history = await readHistory(params.paths.history)
  let nextHistory = applyHistoryLimits(
    history,
    params.config.limits.historySoft,
    params.config.limits.historyHardCount,
  )

  let overflow = false
  if (
    exceedsLimits({
      history: nextHistory,
      hardCount: params.config.limits.historyHardCount,
      hardBytes: params.config.limits.historyHardBytes,
    })
  ) {
    nextHistory = trimArchived({
      history: nextHistory,
      hardCount: params.config.limits.historyHardCount,
      hardBytes: params.config.limits.historyHardBytes,
    })
    if (
      exceedsLimits({
        history: nextHistory,
        hardCount: params.config.limits.historyHardCount,
        hardBytes: params.config.limits.historyHardBytes,
      })
    ) {
      overflow = true
      await appendLog(params.paths.log, {
        event: 'history_overflow',
        count: nextHistory.length,
        bytes: estimateBytes(nextHistory),
      })
    }
  }

  if (shouldArchive(nextHistory, new Date()) || overflow) {
    const daily = await loadTemplate(params.config.workDir, 'daily-summary.md')
    const monthly = await loadTemplate(
      params.config.workDir,
      'monthly-summary.md',
    )
    nextHistory = await archiveHistory({
      history: nextHistory,
      stateDir: params.paths.root,
      workerQueue: params.paths.workerQueue,
      archiveJobsPath: params.paths.archiveJobs,
      dailyTemplate: daily,
      monthlyTemplate: monthly,
    })
  }

  if (nextHistory !== history)
    await writeHistory(params.paths.history, nextHistory)
  return nextHistory
}
