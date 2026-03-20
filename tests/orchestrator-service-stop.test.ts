import { expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  startRuntimeLifecycle: vi.fn(async () => {}),
  prepareRuntimeStop: vi.fn(() => {}),
  persistRuntimeSnapshotOnStop: vi.fn(async () => {}),
  stopStartedChannels: vi.fn(async () => {}),
  stopFallbackChannels: vi.fn(async () => {}),
}))

vi.mock('../src/orchestrator/core/orchestrator-runtime-lifecycle.js', () => ({
  startRuntimeLifecycle: mocks.startRuntimeLifecycle,
  prepareRuntimeStop: mocks.prepareRuntimeStop,
  persistRuntimeSnapshotOnStop: mocks.persistRuntimeSnapshotOnStop,
  waitForRuntimeManagerDrain: vi.fn(async () => {}),
}))

vi.mock('../src/orchestrator/core/orchestrator-channel-lifecycle.js', () => ({
  startOrchestratorChannels: vi.fn(() => mocks.stopStartedChannels),
  stopOrchestratorChannels: mocks.stopFallbackChannels,
  isTelegramPollingConflictError: vi.fn(() => false),
}))

import { defaultConfig } from '../src/config.js'
import { Orchestrator } from '../src/orchestrator/core/orchestrator-service.js'

test('stop reuses the started channel controller instead of building a new one', async () => {
  const orchestrator = new Orchestrator(defaultConfig({ workDir: '.mimikit' }), {
    runtimeId: 'runtime-test-stop',
    startup: {
      startedAt: '2026-03-10T00:00:00.000Z',
      worktree: '.mimikit',
    },
  })

  await orchestrator.start()
  orchestrator.stop()
  await Promise.resolve()

  expect(mocks.startRuntimeLifecycle).toHaveBeenCalledOnce()
  expect(mocks.prepareRuntimeStop).toHaveBeenCalledOnce()
  expect(mocks.stopStartedChannels).toHaveBeenCalledOnce()
  expect(mocks.stopFallbackChannels).not.toHaveBeenCalled()
  expect(mocks.persistRuntimeSnapshotOnStop).toHaveBeenCalledOnce()
})
