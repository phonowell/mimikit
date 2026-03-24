import { useLayoutEffect, useRef, useState } from 'react'

import {
  isScrollStateNearBottom,
  readScrollState,
  shouldStickAfterLayoutShift,
} from '../lib/message-scroll.js'

const getMessagesEl = (): HTMLUListElement | null => {
  const node = document.querySelector('[data-messages]')
  return node instanceof HTMLUListElement ? node : null
}

type ScrollMetrics = {
  previousClientHeight: number
  previousHeight: number
  previousTop: number
  wasNearBottom: boolean
}

export const useMessageScroll = (deps: readonly unknown[]) => {
  const lastClientHeightRef = useRef(0)
  const lastScrollHeightRef = useRef(0)
  const pendingMetricsRef = useRef<ScrollMetrics | null>(null)
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false)

  const updateScrollButton = () => {
    const element = getMessagesEl()
    if (!element) return
    const state = readScrollState(element)
    lastClientHeightRef.current = state.clientHeight
    lastScrollHeightRef.current = state.scrollHeight
    setScrollButtonVisible(!isScrollStateNearBottom(state))
  }

  const captureLayoutShift = () => {
    const element = getMessagesEl()
    if (!element) return
    const state = readScrollState(element)
    pendingMetricsRef.current = {
      previousClientHeight: state.clientHeight,
      previousHeight: state.scrollHeight,
      previousTop: state.scrollTop,
      wasNearBottom: isScrollStateNearBottom(state),
    }
  }

  const scrollToBottom = (smooth = false) => {
    const element = getMessagesEl()
    if (!element) return
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
    element.scrollTo({
      top: maxTop,
      behavior: smooth ? 'smooth' : 'auto',
    })
    setScrollButtonVisible(false)
  }

  const isNearBottomNow = (): boolean => {
    const element = getMessagesEl()
    if (!element) return true
    return isScrollStateNearBottom(readScrollState(element))
  }

  const syncAfterLayoutShift = ({
    stickToBottom = false,
  }: {
    stickToBottom?: boolean
  } = {}) => {
    const element = getMessagesEl()
    if (!element) return
    const state = readScrollState(element)
    const previousClientHeight =
      lastClientHeightRef.current > 0
        ? lastClientHeightRef.current
        : state.clientHeight
    const previousScrollHeight =
      lastScrollHeightRef.current > 0
        ? lastScrollHeightRef.current
        : state.scrollHeight

    lastClientHeightRef.current = state.clientHeight
    lastScrollHeightRef.current = state.scrollHeight
    if (
      stickToBottom ||
      shouldStickAfterLayoutShift({
        previousClientHeight,
        previousScrollHeight,
        state,
      })
    ) {
      scrollToBottom(false)
      return
    }
    setScrollButtonVisible(!isScrollStateNearBottom(state))
  }

  useLayoutEffect(() => {
    const element = getMessagesEl()
    const metrics = pendingMetricsRef.current
    if (!element || !metrics) {
      syncAfterLayoutShift()
      return
    }
    pendingMetricsRef.current = null
    if (metrics.wasNearBottom) {
      scrollToBottom(false)
      lastClientHeightRef.current = element.clientHeight
      lastScrollHeightRef.current = element.scrollHeight
      return
    }
    const delta = element.scrollHeight - metrics.previousHeight
    element.scrollTop = Math.max(0, metrics.previousTop + delta)
    lastClientHeightRef.current = metrics.previousClientHeight
    lastScrollHeightRef.current = metrics.previousHeight
    syncAfterLayoutShift()
  }, deps)

  return {
    captureLayoutShift,
    isNearBottom: isNearBottomNow,
    onScroll: updateScrollButton,
    scrollButtonVisible,
    scrollToBottom,
    syncAfterLayoutShift,
  }
}
