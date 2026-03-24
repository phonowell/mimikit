export const BOTTOM_THRESHOLD_MULTIPLIER = 1.5

export type ScrollState = {
  clientHeight: number
  distance: number
  scrollHeight: number
  scrollTop: number
}

export const getBottomThreshold = (
  clientHeight: number,
  multiplier = BOTTOM_THRESHOLD_MULTIPLIER,
): number => Math.max(0, clientHeight * multiplier)

export const readScrollState = (element: HTMLUListElement): ScrollState => ({
  clientHeight: element.clientHeight,
  distance: element.scrollHeight - element.scrollTop - element.clientHeight,
  scrollHeight: element.scrollHeight,
  scrollTop: element.scrollTop,
})

export const isScrollStateNearBottom = (
  state: ScrollState,
  multiplier = BOTTOM_THRESHOLD_MULTIPLIER,
): boolean =>
  state.clientHeight === 0 ||
  state.distance <= getBottomThreshold(state.clientHeight, multiplier)

export const shouldStickAfterLayoutShift = (params: {
  previousClientHeight: number
  previousScrollHeight: number
  state: ScrollState
  bottomThresholdMultiplier?: number
}): boolean => {
  const multiplier =
    params.bottomThresholdMultiplier ?? BOTTOM_THRESHOLD_MULTIPLIER
  const previousDistance =
    params.state.distance -
    (params.state.scrollHeight - params.previousScrollHeight) +
    (params.state.clientHeight - params.previousClientHeight)
  const previousThreshold = getBottomThreshold(
    params.previousClientHeight,
    multiplier,
  )

  return (
    (params.state.clientHeight !== params.previousClientHeight ||
      params.state.scrollHeight !== params.previousScrollHeight) &&
    previousDistance <= previousThreshold
  )
}
