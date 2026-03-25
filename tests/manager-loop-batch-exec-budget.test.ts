import { expect, test } from 'vitest'

import {
  normalizePromptSectionLimits,
  resolveManagerContextBudgetDecision,
} from '../src/policy/manager/context-budget.js'
import { createRuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

import type { AppConfig, PromptSectionLimits } from '../src/bootstrap/config.js'

const baseLimits: PromptSectionLimits = {
  actionFeedbackMaxBytes: 8192,
  batchResultsMaxBytes: 20480,
  environmentMaxBytes: 4096,
  focusListMaxBytes: 8192,
  inputsMaxBytes: 8192,
  memoryMaxBytes: 8192,
  plansMaxBytes: 16384,
  recentHistoryMaxBytes: 8192,
  tasksMaxBytes: 24576,
  workingFocusesMaxBytes: 20480,
}

const createRuntime = (limits: PromptSectionLimits) => {
  const config: AppConfig = {
    workDir: '.mimikit-test',
    manager: {
      model: 'gpt-5',
      modelReasoningEffort: 'medium',
      maxCorrectionRounds: 3,
      promptSections: limits,
      taskCreate: { debounceMs: 1000 },
      taskWindow: { maxCount: 10, minCount: 1 },
      planWindow: { maxCount: 10, minCount: 1 },
    },
    worker: {
      maxConcurrent: 1,
      retry: { maxAttempts: 1, backoffMs: 1000 },
      timeoutMs: 60000,
      budget: { maxDurationMs: 60000, maxRounds: 1 },
    },
    codex: {
      enabled: true,
      model: 'gpt-5-codex',
      modelReasoningEffort: 'medium',
      capability: 'medium',
      billing: 'low',
    },
    webui: { enabled: false, port: 8787 },
    telegram: {
      enabled: false,
      botToken: '',
      chatId: '',
      apiRoot: '',
      proxy: '',
    },
    feishu: {
      enabled: false,
      appId: '',
      appSecret: '',
      chatId: '',
    },
  }
  const runtime = createRuntimeState(config, {
    runtimeId: 'runtime-test-budget',
    startup: {
      startedAt: '2026-03-10T00:00:00.000Z',
      worktree: '.mimikit-test',
    },
  })
  runtime.focuses.push({
    id: 'focus-1',
    title: 'Focus',
    status: 'active',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    lastActivityAt: '2026-03-10T00:00:00.000Z',
  })
  return runtime
}

test('manager context budget decision keeps configured limits across wake profiles', () => {
  const runtime = createRuntime(baseLimits)

  const userInputDecision = resolveManagerContextBudgetDecision({
    runtime,
    inputs: [
      {
        id: 'input-1',
        role: 'user',
        text: 'continue',
        focusId: 'focus-1',
        createdAt: '2026-03-10T00:00:00.000Z',
      },
    ],
    results: [],
  })
  const taskResultDecision = resolveManagerContextBudgetDecision({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-1',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: 1,
        completedAt: '2026-03-10T00:00:01.000Z',
      },
    ],
  })

  expect(userInputDecision.wakeProfile).toBe('user_input')
  expect(taskResultDecision.wakeProfile).toBe('task_result')
  expect(userInputDecision.policy).toBe('fixed')
  expect(taskResultDecision.activeFocusCount).toBe(1)
  expect(userInputDecision.promptSectionLimits).toEqual(baseLimits)
  expect(taskResultDecision.promptSectionLimits).toEqual(baseLimits)
})

test('normalizePromptSectionLimits keeps a hard minimum floor', () => {
  const normalized = normalizePromptSectionLimits({
    ...baseLimits,
    environmentMaxBytes: 200,
    inputsMaxBytes: 511,
  })
  expect(normalized.environmentMaxBytes).toBe(512)
  expect(normalized.inputsMaxBytes).toBe(512)
  expect(normalized.tasksMaxBytes).toBe(baseLimits.tasksMaxBytes)
})
