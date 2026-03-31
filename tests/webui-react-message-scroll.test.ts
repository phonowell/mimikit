import { afterEach, expect, test, vi } from 'vitest'

import {
  isScrollStateNearBottom,
  observeElementContentResize,
  restoreExactBottomIfNeeded,
  scrollElementToBottom,
} from '../webui-src/lib/message-scroll.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('near-bottom detection keeps a small fixed threshold', () => {
  expect(
    isScrollStateNearBottom({
      clientHeight: 400,
      distance: 500,
      scrollHeight: 1_300,
      scrollTop: 400,
    }),
  ).toBe(false)
})

test('near-bottom detection keeps the follow zone tight', () => {
  expect(
    isScrollStateNearBottom({
      clientHeight: 400,
      distance: 36,
      scrollHeight: 1_300,
      scrollTop: 864,
    }),
  ).toBe(true)
})

test('programmatic auto scroll writes scrollTop directly and lands at bottom', () => {
  const scrollTo = vi.fn()
  const element = {
    clientHeight: 400,
    scrollHeight: 1_300,
    scrollTop: 180,
    scrollTo,
  } as unknown as HTMLUListElement

  const state = scrollElementToBottom(element, false)

  expect(scrollTo).not.toHaveBeenCalled()
  expect(element.scrollTop).toBe(900)
  expect(isScrollStateNearBottom(state)).toBe(true)
})

test('exact-bottom restore removes a small late layout gap while following bottom', () => {
  const element = {
    clientHeight: 400,
    scrollHeight: 1_300,
    scrollTop: 180,
    scrollTo: vi.fn(),
  } as unknown as HTMLUListElement

  scrollElementToBottom(element, false)
  element.scrollHeight = 1_308

  const state = restoreExactBottomIfNeeded(element)

  expect(element.scrollTop).toBe(908)
  expect(state.distance).toBe(0)
  expect(isScrollStateNearBottom(state)).toBe(true)
})

test('content resize observer tracks direct message nodes across child mutations', () => {
  const resizeInstances: Array<{
    callback: () => void
    disconnect: ReturnType<typeof vi.fn>
    observe: ReturnType<typeof vi.fn>
    unobserve: ReturnType<typeof vi.fn>
  }> = []
  let mutationCallback:
    | ((
        records: Array<{ addedNodes: unknown[]; removedNodes: unknown[] }>,
      ) => void)
    | null = null
  const mutationDisconnect = vi.fn()
  const mutationObserve = vi.fn()

  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn()
      observe = vi.fn()
      unobserve = vi.fn()

      constructor(callback: () => void) {
        resizeInstances.push({
          callback,
          disconnect: this.disconnect,
          observe: this.observe,
          unobserve: this.unobserve,
        })
      }
    },
  )
  vi.stubGlobal(
    'MutationObserver',
    class {
      disconnect = mutationDisconnect
      observe = mutationObserve

      constructor(
        callback: (
          records: Array<{ addedNodes: unknown[]; removedNodes: unknown[] }>,
        ) => void,
      ) {
        mutationCallback = callback
      }
    },
  )

  const firstChild = { nodeType: 1 }
  const secondChild = { nodeType: 1 }
  const list = { children: [firstChild] } as unknown as HTMLUListElement
  const onContentResize = vi.fn()

  const cleanup = observeElementContentResize(list, onContentResize)

  expect(resizeInstances).toHaveLength(1)
  expect(resizeInstances[0]?.observe).toHaveBeenCalledWith(firstChild)
  expect(mutationObserve).toHaveBeenCalledWith(list, { childList: true })

  mutationCallback?.([{ addedNodes: [secondChild], removedNodes: [] }])

  expect(resizeInstances[0]?.observe).toHaveBeenCalledWith(secondChild)
  expect(onContentResize).toHaveBeenCalledTimes(1)

  mutationCallback?.([{ addedNodes: [], removedNodes: [firstChild] }])

  expect(resizeInstances[0]?.unobserve).toHaveBeenCalledWith(firstChild)
  expect(onContentResize).toHaveBeenCalledTimes(2)

  resizeInstances[0]?.callback()

  expect(onContentResize).toHaveBeenCalledTimes(3)

  cleanup()

  expect(resizeInstances[0]?.disconnect).toHaveBeenCalledTimes(1)
  expect(mutationDisconnect).toHaveBeenCalledTimes(1)
})
