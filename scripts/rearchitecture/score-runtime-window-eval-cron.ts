import { percentile, toMs, withFourDecimals } from './score-runtime-window-model.js'

import type { LogRow, ScoreValue } from './score-runtime-window-model.js'

export const evaluateCronScore = (params: {
  logs: LogRow[]
}): {
  cronTriggerRows: LogRow[]
  cronWithActionCount: number
  cronDuplicateObserved: number
  cronP95Seconds: ScoreValue
} => {
  const cronTriggerRows = params.logs.filter(
    (row) =>
      row.event === 'trigger_fire_input' &&
      (row.triggerReason === 'cron' || row.triggerReason === 'scheduled_at'),
  )
  const runTaskCreatedRows = params.logs.filter(
    (row) => row.event === 'run_task_dispatch' && row.mode === 'created',
  )
  const latenciesMs: number[] = []
  let cronWithActionCount = 0
  for (const trigger of cronTriggerRows) {
    const triggerMs = toMs(trigger.time)
    if (triggerMs === undefined) continue
    const firstAction = runTaskCreatedRows
      .map((item) => toMs(item.time))
      .filter((item): item is number => item !== undefined)
      .find((ms) => ms >= triggerMs)
    if (firstAction === undefined) continue
    const latency = firstAction - triggerMs
    if (latency < 0 || latency > 10 * 60 * 1000) continue
    latenciesMs.push(latency)
    cronWithActionCount += 1
  }
  const p95 = percentile(latenciesMs, 0.95)

  const cronGroupBySecond = new Map<string, number>()
  for (const trigger of cronTriggerRows) {
    const planId = typeof trigger.planId === 'string' ? trigger.planId : ''
    const second = trigger.time?.slice(0, 19)
    if (!planId || !second) continue
    const key = `${planId}\n${second}`
    cronGroupBySecond.set(key, (cronGroupBySecond.get(key) ?? 0) + 1)
  }
  const cronDuplicateObserved = [...cronGroupBySecond.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  )

  return {
    cronTriggerRows,
    cronWithActionCount,
    cronDuplicateObserved,
    cronP95Seconds: p95 === undefined ? 'na' : withFourDecimals(p95 / 1000),
  }
}
