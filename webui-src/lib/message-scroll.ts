export const BOTTOM_THRESHOLD_PX = 48

export type ScrollState = {
  clientHeight: number
  distance: number
  scrollHeight: number
  scrollTop: number
}

const ELEMENT_NODE = 1

const isElementNode = (value: unknown): value is Element =>
  typeof value === 'object' &&
  value !== null &&
  'nodeType' in value &&
  value.nodeType === ELEMENT_NODE

export const getBottomThreshold = (
  _clientHeight: number,
  thresholdPx = BOTTOM_THRESHOLD_PX,
): number => Math.max(0, thresholdPx)

export const readScrollState = (element: HTMLUListElement): ScrollState => ({
  clientHeight: element.clientHeight,
  distance: element.scrollHeight - element.scrollTop - element.clientHeight,
  scrollHeight: element.scrollHeight,
  scrollTop: element.scrollTop,
})

export const scrollElementToBottom = (
  element: HTMLUListElement,
  smooth = false,
): ScrollState => {
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
  if (smooth && typeof element.scrollTo === 'function') {
    element.scrollTo({
      top: maxTop,
      behavior: 'smooth',
    })
  } else element.scrollTop = maxTop

  return readScrollState(element)
}

export const restoreExactBottomIfNeeded = (
  element: HTMLUListElement,
): ScrollState => {
  const state = readScrollState(element)
  if (state.distance <= 0) return state
  return scrollElementToBottom(element, false)
}

export const observeElementContentResize = (
  element: HTMLUListElement,
  onContentResize: () => void,
): (() => void) => {
  if (typeof globalThis.ResizeObserver !== 'function') return () => undefined

  const observedChildren = new Set<Element>()
  const resizeObserver = new globalThis.ResizeObserver(() => onContentResize())

  const observeChild = (value: unknown) => {
    if (!isElementNode(value) || observedChildren.has(value)) return
    observedChildren.add(value)
    resizeObserver.observe(value)
  }

  const unobserveChild = (value: unknown) => {
    if (!isElementNode(value) || !observedChildren.delete(value)) return
    resizeObserver.unobserve(value)
  }

  for (const child of Array.from(element.children)) observeChild(child)

  let mutationObserver: MutationObserver | null = null
  if (typeof globalThis.MutationObserver === 'function') {
    mutationObserver = new globalThis.MutationObserver((records) => {
      let childListChanged = false
      for (const record of records) {
        for (const node of record.addedNodes) {
          observeChild(node)
          childListChanged = true
        }
        for (const node of record.removedNodes) {
          unobserveChild(node)
          childListChanged = true
        }
      }
      if (childListChanged) onContentResize()
    })
    mutationObserver.observe(element, { childList: true })
  }

  return () => {
    mutationObserver?.disconnect()
    resizeObserver.disconnect()
  }
}

export const isScrollStateNearBottom = (
  state: ScrollState,
  thresholdPx = BOTTOM_THRESHOLD_PX,
): boolean =>
  state.clientHeight === 0 ||
  state.distance <= getBottomThreshold(state.clientHeight, thresholdPx)
