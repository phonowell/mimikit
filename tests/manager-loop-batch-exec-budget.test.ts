import { expect, test } from 'vitest'

import {
  resolvePromptSectionLimitsForWakeProfile,
  trimPromptSectionLimitsForTaskResult,
} from '../src/manager/loop-batch-exec.js'
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
  queryLookupMaxBytes: 20480,
  recentHistoryMaxBytes: 8192,
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

test('wake profile tiering keeps heavy rounds with larger task/result budgets than lite', async () => {
  const lite = resolvePromptSectionLimitsForWakeProfile(
    {
      ...baseLimits,
      tasksMaxBytes: 12288,
      batchResultsMaxBytes: 12288,
    },
    'user_input',
  )
  const heavy = resolvePromptSectionLimitsForWakeProfile(
    {
      ...baseLimits,
      tasksMaxBytes: 32768,
      batchResultsMaxBytes: 28672,
    },
    'mixed',
  )
  expect(heavy.tasksMaxBytes).toBeGreaterThan(lite.tasksMaxBytes)
  expect(heavy.batchResultsMaxBytes).toBeGreaterThan(lite.batchResultsMaxBytes)
})

test('mixed wake no longer inflates to heavy tier baseline', async () => {
  const mixed = resolvePromptSectionLimitsForWakeProfile(
    {
      ...baseLimits,
      tasksMaxBytes: 24576,
      batchResultsMaxBytes: 20480,
    },
    'mixed',
  )
  expect(mixed.tasksMaxBytes).toBe(baseLimits.tasksMaxBytes)
  expect(mixed.batchResultsMaxBytes).toBe(baseLimits.batchResultsMaxBytes)
})

test('task_result trim reduces heavy context sections while keeping minimum floor', () => {
  const fromPreset = resolvePromptSectionLimitsForWakeProfile(
    {
      ...baseLimits,
      tasksMaxBytes: 24576,
      batchResultsMaxBytes: 20480,
      recentHistoryMaxBytes: 8192,
      focusContextsMaxBytes: 20480,
      historyLookupMaxBytes: 20480,
      queryLookupMaxBytes: 20480,
      fileLookupMaxBytes: 20480,
    },
    'task_result',
  )
  const trimmed = trimPromptSectionLimitsForTaskResult(fromPreset)
  expect(trimmed.tasksMaxBytes).toBeLessThan(fromPreset.tasksMaxBytes)
  expect(trimmed.batchResultsMaxBytes).toBeLessThan(
    fromPreset.batchResultsMaxBytes,
  )
  expect(trimmed.recentHistoryMaxBytes).toBeLessThan(
    fromPreset.recentHistoryMaxBytes,
  )
  expect(trimmed.focusContextsMaxBytes).toBeLessThan(
    fromPreset.focusContextsMaxBytes,
  )
  expect(trimmed.historyLookupMaxBytes).toBeLessThan(
    fromPreset.historyLookupMaxBytes,
  )
  expect(trimmed.queryLookupMaxBytes).toBeLessThan(fromPreset.queryLookupMaxBytes)
  expect(trimmed.fileLookupMaxBytes).toBeLessThan(fromPreset.fileLookupMaxBytes)
  expect(trimmed.inputsMaxBytes).toBe(fromPreset.inputsMaxBytes)
  expect(trimmed.tasksMaxBytes).toBeGreaterThanOrEqual(512)
  expect(trimmed.batchResultsMaxBytes).toBeGreaterThanOrEqual(512)
})
