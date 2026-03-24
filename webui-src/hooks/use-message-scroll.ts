import { useLayoutEffect, useRef, useState } from 'react'

import { isScrollStateNearBottom, readScrollState } from '../lib/message-scroll.js'

type ScrollMetrics = {
  previousHeight: number
  previousTop: number
  wasFollowingBottom: boolean
}

export const useMessageScroll = (deps: readonly unknown[]) => {
  const listRef = useRef<HTMLUListElement | null>(null)
  const followBottomRef = useRef(true)
  const pendingMetricsRef = useRef<ScrollMetrics | null>(null)
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false)

  const updateScrollButton = () => {
    const element = listRef.current
    if (!element) return
    const state = readScrollState(element)
    const nearBottom = isScrollStateNearBottom(state)
    followBottomRef.current = nearBottom
    setScrollButtonVisible(!nearBottom)
  }

  const captureLayoutShift = () => {
    const element = listRef.current
    if (!element) return
    const state = readScrollState(element)
    pendingMetricsRef.current = {
      previousHeight: state.scrollHeight,
      previousTop: state.scrollTop,
      wasFollowingBottom: followBottomRef.current,
    }
  }

  const scrollToBottom = (smooth = false) => {
    const element = listRef.current
    if (!element) return
    followBottomRef.current = true
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
    element.scrollTo({
      top: maxTop,
      behavior: smooth ? 'smooth' : 'auto',
    })
    setScrollButtonVisible(false)
  }

  const isNearBottomNow = (): boolean => {
    return followBottomRef.current
  }

  const syncAfterLayoutShift = ({
    stickToBottom = false,
  }: {
    stickToBottom?: boolean
  } = {}) => {
    const element = listRef.current
    if (!element) return
    if (stickToBottom || followBottomRef.current) {
      scrollToBottom(false)
      return
    }
    setScrollButtonVisible(true)
  }

  useLayoutEffect(() => {
    const element = listRef.current
    const metrics = pendingMetricsRef.current
    if (!element || !metrics) {
      syncAfterLayoutShift()
      return
    }
    pendingMetricsRef.current = null
    if (metrics.wasFollowingBottom) {
      scrollToBottom(false)
      return
    }
    const delta = element.scrollHeight - metrics.previousHeight
    element.scrollTop = Math.max(0, metrics.previousTop + delta)
    setScrollButtonVisible(true)
  }, deps)

  return {
    captureLayoutShift,
    isNearBottom: isNearBottomNow,
    listRef,
    onScroll: updateScrollButton,
    scrollButtonVisible,
    scrollToBottom,
    syncAfterLayoutShift,
  }
}
