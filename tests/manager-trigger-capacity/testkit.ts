import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { beforeEach, vi } from 'vitest'

import { notifyManagerLoop } from '../../src/kernel/orchestrator/signals.js'
import { readJsonl } from '../../src/persistence/storage/jsonl.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

const hoistedMocks = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

export const runManagerRoundWithRecoveryMock =
  hoistedMocks.runManagerRoundWithRecoveryMock

vi.mock('../../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: hoistedMocks.runManagerRoundWithRecoveryMock,
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-trigger-capacity-'))

export const settle = (ms = 150) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
  runManagerRoundWithRecoveryMock.mockResolvedValue({
    output: '',
    elapsedMs: 0,
    wakeProfile: 'capacity',
  })
})

const createTestConfig = (
  workDir: string,
  maxConcurrent: number,
): RuntimeState['config'] => ({
  workDir,
  manager: {
    model: 'gpt-test-manager',
    modelReasoningEffort: 'minimal',
    baseUrl: '',
    apiKey: '',
    proxy: '',
    maxCorrectionRounds: 1,
    promptSections: {
      actionFeedbackMaxBytes: 2048,
      batchResultsMaxBytes: 4096,
      environmentMaxBytes: 2048,
      focusListMaxBytes: 2048,
      inputsMaxBytes: 2048,
      memoryMaxBytes: 2048,
      plansMaxBytes: 4096,
      recentHistoryMaxBytes: 2048,
      tasksMaxBytes: 4096,
      workingFocusesMaxBytes: 4096,
    },
    taskCreate: { debounceMs: 0 },
    taskWindow: { minCount: 1, maxCount: 5 },
    planWindow: { minCount: 1, maxCount: 5 },
  },
  worker: {
    maxConcurrent,
    retry: { maxAttempts: 1, backoffMs: 1 },
    timeoutMs: 60_000,
  },
  codex: {
    enabled: true,
    model: 'gpt-test-codex',
    modelReasoningEffort: 'minimal',
    capability: 'medium',
    billing: 'low',
    proxy: '',
  },
  webui: {
    enabled: true,
    port: 8787,
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
    chatId: '',
  },
})

export const countSystemEvent = async (
  runtime: RuntimeState,
  name: string,
): Promise<number> => {
  const packets = await readJsonl<{
    payload?: {
      role?: string
      systemEventName?: string
    }
  }>(
    runtime.paths.inputsPackets,
    { ensureFile: true },
  )
  return packets.filter((packet) => {
    const payload = packet.payload
    return payload?.role === 'system' && payload.systemEventName === name
  }).length
}

export const createRuntime = async (params?: {
  maxConcurrent?: number
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    maxConcurrent: Math.max(1, params?.maxConcurrent ?? 1),
  })
  runtime.config = createTestConfig(
    workDir,
    Math.max(1, params?.maxConcurrent ?? 1),
  )
  runtime.worker.queue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
  return runtime
}

export const stopLoop = async (
  runtime: RuntimeState,
  loopPromise: Promise<void>,
): Promise<void> => {
  runtime.session.stopped = true
  notifyManagerLoop(runtime)
  await loopPromise
}
