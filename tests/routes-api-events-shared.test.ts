import { expect, test, vi } from 'vitest'

import { closeSseSource } from '../src/surface/http/routes-api-events-shared.js'

test('closeSseSource ignores replies without sseContext', () => {
  expect(() =>
    closeSseSource({} as Parameters<typeof closeSseSource>[0]),
  ).not.toThrow()
})

test('closeSseSource ends open sources once', () => {
  const end = vi.fn()

  closeSseSource({
    sseContext: {
      source: {
        end,
      },
    },
  } as Parameters<typeof closeSseSource>[0])

  expect(end).toHaveBeenCalledTimes(1)
})

test('closeSseSource skips ended or destroyed sources', () => {
  const destroyedEnd = vi.fn()
  const endedEnd = vi.fn()

  closeSseSource({
    sseContext: {
      source: {
        end: destroyedEnd,
        destroyed: true,
      },
    },
  } as Parameters<typeof closeSseSource>[0])
  closeSseSource({
    sseContext: {
      source: {
        end: endedEnd,
        writableEnded: true,
      },
    },
  } as Parameters<typeof closeSseSource>[0])

  expect(destroyedEnd).not.toHaveBeenCalled()
  expect(endedEnd).not.toHaveBeenCalled()
})
