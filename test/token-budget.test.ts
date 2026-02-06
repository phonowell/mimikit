import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { addTokenUsage, canSpendTokens, isTokenBudgetExceeded } from '../src/supervisor/token-budget.js'
import type { RuntimeState } from '../src/supervisor/runtime.js'

const createRuntime = (): RuntimeState => ({
  config: defaultConfig({ stateDir: '.mimikit-test', workDir: '.' }),
  paths: {
    root: '.mimikit-test',
    history: '.mimikit-test/history.jsonl',
    log: '.mimikit-test/log.jsonl',
  },
  stopped: false,
  managerRunning: false,
  managerPendingInputs: [],
  pendingInputs: [],
  pendingResults: [],
  tasks: [],
  runningWorkers: new Set(),
  runningControllers: new Map(),
  tokenBudget: {
    date: new Date().toISOString().slice(0, 10),
    spent: 0,
  },
})

test('token budget allows and blocks by limit', () => {
  const runtime = createRuntime()
  runtime.config.tokenBudget.dailyTotal = 100
  expect(canSpendTokens(runtime, 50)).toBe(true)
  addTokenUsage(runtime, 50)
  expect(canSpendTokens(runtime, 49)).toBe(true)
  expect(canSpendTokens(runtime, 51)).toBe(false)
})

test('token budget exceeded reflects spent amount', () => {
  const runtime = createRuntime()
  runtime.config.tokenBudget.dailyTotal = 10
  addTokenUsage(runtime, 10)
  expect(isTokenBudgetExceeded(runtime)).toBe(true)
})

