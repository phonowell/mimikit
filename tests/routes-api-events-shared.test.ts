import { EventEmitter } from 'node:events'

import { expect, test, vi } from 'vitest'

import {
  closeSseSource,
  registerSseClientCloseHandlers,
} from '../src/surface/http/routes-api-events-shared.js'

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

test('registerSseClientCloseHandlers ignores request close and reacts to reply close', () => {
  const requestRaw = new EventEmitter()
  const replyRaw = new EventEmitter()
  const onClose = vi.fn()
  const cleanup = registerSseClientCloseHandlers(
    { raw: requestRaw } as Parameters<typeof registerSseClientCloseHandlers>[0],
    { raw: replyRaw } as Parameters<typeof registerSseClientCloseHandlers>[1],
    onClose,
  )

  requestRaw.emit('close')
  expect(onClose).not.toHaveBeenCalled()

  replyRaw.emit('close')
  expect(onClose).toHaveBeenCalledTimes(1)

  cleanup()
})

test('registerSseClientCloseHandlers closes once across aborted and reply close', () => {
  const requestRaw = new EventEmitter()
  const replyRaw = new EventEmitter()
  const onClose = vi.fn()
  const cleanup = registerSseClientCloseHandlers(
    { raw: requestRaw } as Parameters<typeof registerSseClientCloseHandlers>[0],
    { raw: replyRaw } as Parameters<typeof registerSseClientCloseHandlers>[1],
    onClose,
  )

  requestRaw.emit('aborted')
  replyRaw.emit('close')

  expect(onClose).toHaveBeenCalledTimes(1)

  cleanup()
})
