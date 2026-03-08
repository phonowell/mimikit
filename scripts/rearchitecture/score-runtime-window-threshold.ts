import type { ScoreThreshold, ScoreValue } from './score-runtime-window-model.js'

export const buildThresholds = (): Record<string, ScoreThreshold> => ({
  task_success_rate: { min: 0.95 },
  route_correct_rate: { min: 0.98 },
  progress_integrity_rate: { min: 0.99 },
  contract_completeness_rate: { min: 0.99 },
  continuity_contract_match_rate: { min: 0.98 },
  evidence_quality_pass_rate: { min: 0.98 },
  cron_trigger_success_rate: { min: 0.99 },
  cron_duplicate_suppression_rate: { min: 0.98 },
  cron_false_trigger_rate: { max: 0.005 },
  golden_replay_match_rate: { min: 0.99 },
  replay_determinism_rate: { min: 0.99 },
})

export const buildBlockers = (params: {
  governance: Record<string, ScoreValue>
  thresholds: Record<string, ScoreThreshold>
}): string[] => {
  const notCollected = Object.entries(params.governance)
    .filter(([, value]) => value === 'not_collected')
    .map(([key]) => `${key}:not_collected`)

  const thresholdViolations = Object.entries(params.thresholds)
    .map(([key, threshold]) => {
      const value = params.governance[key]
      if (typeof value !== 'number') return undefined
      if (threshold.min !== undefined && value < threshold.min)
        return `${key}:below_min(${value}<${threshold.min})`
      if (threshold.max !== undefined && value > threshold.max)
        return `${key}:above_max(${value}>${threshold.max})`
      return undefined
    })
    .filter((item): item is string => Boolean(item))

  return [...notCollected, ...thresholdViolations]
}
