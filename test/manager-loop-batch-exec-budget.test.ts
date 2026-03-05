import { expect, test } from 'vitest'

import { resolvePromptSectionLimitsForWakeProfile } from '../src/manager/loop-batch-exec.js'
import type { PromptSectionLimits } from '../src/config.js'

const baseLimits: PromptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  compressedContextMaxBytes: 12288,
  environmentMaxBytes: 4096,
  fileLookupMaxBytes: 20480,
  focusContextsMaxBytes: 20480,
  focusListMaxBytes: 8192,
  historyLookupMaxBytes: 20480,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  plansMaxBytes: 16384,
  recentHistoryMaxBytes: 8192,
  taskArchiveLookupMaxBytes: 20480,
  tasksMaxBytes: 24576,
}

test('resolvePromptSectionLimitsForWakeProfile boosts result sections for task_result wake', () => {
  const limits = resolvePromptSectionLimitsForWakeProfile(baseLimits, 'task_result')
  expect(limits.batchResultsMaxBytes).toBeGreaterThan(baseLimits.batchResultsMaxBytes)
  expect(limits.tasksMaxBytes).toBeGreaterThan(baseLimits.tasksMaxBytes)
  expect(limits.inputsMaxBytes).toBeLessThan(baseLimits.inputsMaxBytes)
})

test('resolvePromptSectionLimitsForWakeProfile boosts input/history sections for user_input wake', () => {
  const limits = resolvePromptSectionLimitsForWakeProfile(baseLimits, 'user_input')
  expect(limits.inputsMaxBytes).toBeGreaterThan(baseLimits.inputsMaxBytes)
  expect(limits.recentHistoryMaxBytes).toBeGreaterThan(baseLimits.recentHistoryMaxBytes)
  expect(limits.batchResultsMaxBytes).toBeLessThan(baseLimits.batchResultsMaxBytes)
})
