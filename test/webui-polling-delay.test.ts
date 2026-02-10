import { expect, test, vi } from 'vitest'

import { createPollingDelayController } from '../src/webui/messages/polling-delay.js'

test('createPollingDelayController exposes clear passthrough', () => {
  const clear = vi.fn()
  const schedule = vi.fn<(pollFn: () => void, delayMs: number) => void>()

  const delay = createPollingDelayController({
    isPolling: () => true,
    isPaused: () => false,
    schedule,
    clear,
    isFullyIdle: () => false,
    activePollMs: 2000,
    idlePollMs: 30000,
    retryBaseMs: 1000,
    retryMaxMs: 30000,
    getConsecutiveFailures: () => 0,
  })

  expect(typeof delay.clear).toBe('function')
  delay.clear()
  expect(clear).toHaveBeenCalledTimes(1)
})
