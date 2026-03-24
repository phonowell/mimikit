import { afterEach, expect, test, vi } from 'vitest'

import { createNowTickStore } from '../webui-src/hooks/use-now-tick.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('now tick store shares one timer across subscribers and updates snapshot', () => {
  vi.useFakeTimers()
  let now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)

  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
  const store = createNowTickStore(60_000)
  const first = vi.fn()
  const second = vi.fn()

  const unsubscribeFirst = store.subscribe(first)
  const unsubscribeSecond = store.subscribe(second)

  expect(setIntervalSpy).toHaveBeenCalledTimes(1)

  now = 61_000
  vi.advanceTimersByTime(60_000)

  expect(store.getSnapshot()).toBe(61_000)
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)

  unsubscribeFirst()
  expect(clearIntervalSpy).not.toHaveBeenCalled()

  unsubscribeSecond()
  expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
})

test('subscribing refreshes a stale snapshot before the first interval tick', async () => {
  vi.useFakeTimers()
  let now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)

  const store = createNowTickStore(60_000)
  const first = vi.fn()
  const unsubscribeFirst = store.subscribe(first)

  await Promise.resolve()
  expect(store.getSnapshot()).toBe(1_000)
  expect(first).not.toHaveBeenCalled()

  unsubscribeFirst()
  now = 91_000

  const second = vi.fn()
  const unsubscribeSecond = store.subscribe(second)

  await Promise.resolve()
  expect(store.getSnapshot()).toBe(91_000)
  expect(second).toHaveBeenCalledTimes(1)

  unsubscribeSecond()
})
