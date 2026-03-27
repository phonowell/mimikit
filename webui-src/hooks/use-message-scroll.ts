import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  isScrollStateNearBottom,
  readScrollState,
  restoreExactBottomIfNeeded,
  scrollElementToBottom,
} from '../lib/message-scroll.js'

type ScrollMetrics = {
  previousHeight: number
  previousTop: number
  wasFollowingBottom: boolean
}

export const useMessageScroll = (deps: readonly unknown[]) => {
  const listRef = useRef<HTMLUListElement | null>(null)
  const followBottomRef = useRef(true)
  const pendingMetricsRef = useRef<ScrollMetrics | null>(null)
  const pendingBottomLockFrameRef = useRef<number | null>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const syncFollowState = useCallback((nearBottom: boolean) => {
    followBottomRef.current = nearBottom
    setIsNearBottom((current) =>
      current === nearBottom ? current : nearBottom,
    )
  }, [])

  const syncFromElement = useCallback(
    (element: HTMLUListElement) => {
      const state = readScrollState(element)
      const nearBottom = isScrollStateNearBottom(state)
      syncFollowState(nearBottom)
      return nearBottom
    },
    [syncFollowState],
  )

  const updateScrollButton = useEffectEvent(() => {
    const element = listRef.current
    if (!element) return
    syncFromElement(element)
  })

  const captureLayoutShift = useCallback(() => {
    const element = listRef.current
    if (!element) return
    const state = readScrollState(element)
    pendingMetricsRef.current = {
      previousHeight: state.scrollHeight,
      previousTop: state.scrollTop,
      wasFollowingBottom: followBottomRef.current,
    }
  }, [])

  const cancelPendingBottomLock = useCallback(() => {
    if (
      pendingBottomLockFrameRef.current === null ||
      typeof window === 'undefined'
    )
      return
    window.cancelAnimationFrame(pendingBottomLockFrameRef.current)
    pendingBottomLockFrameRef.current = null
  }, [])

  const scheduleExactBottomRestore = useCallback(() => {
    if (typeof window === 'undefined') return
    cancelPendingBottomLock()
    pendingBottomLockFrameRef.current = window.requestAnimationFrame(() => {
      pendingBottomLockFrameRef.current = null
      const element = listRef.current
      if (!element || !followBottomRef.current) return
      const nextState = restoreExactBottomIfNeeded(element)
      syncFollowState(isScrollStateNearBottom(nextState))
    })
  }, [cancelPendingBottomLock, syncFollowState])

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const element = listRef.current
      if (!element) return
      const nextState = scrollElementToBottom(element, smooth)
      if (smooth) {
        syncFollowState(true)
        return
      }
      syncFollowState(isScrollStateNearBottom(nextState))
      scheduleExactBottomRestore()
    },
    [scheduleExactBottomRestore, syncFollowState],
  )

  const syncAfterLayoutShift = useCallback(
    ({
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
      syncFollowState(false)
    },
    [scrollToBottom, syncFollowState],
  )

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    updateScrollButton()
    element.addEventListener('scroll', updateScrollButton, { passive: true })
    return () => element.removeEventListener('scroll', updateScrollButton)
  }, [updateScrollButton])

  useEffect(() => cancelPendingBottomLock, [cancelPendingBottomLock])

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
    syncFollowState(false)
  }, deps)

  return useMemo(
    () => ({
      captureLayoutShift,
      isNearBottom,
      listRef,
      scrollButtonVisible: !isNearBottom,
      scrollToBottom,
      syncAfterLayoutShift,
    }),
    [
      captureLayoutShift,
      isNearBottom,
      listRef,
      scrollToBottom,
      syncAfterLayoutShift,
    ],
  )
}
