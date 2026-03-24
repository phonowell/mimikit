export const BOTTOM_THRESHOLD_PX = 48

export type ScrollState = {
  clientHeight: number
  distance: number
  scrollHeight: number
  scrollTop: number
}

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

export const isScrollStateNearBottom = (
  state: ScrollState,
  thresholdPx = BOTTOM_THRESHOLD_PX,
): boolean =>
  state.clientHeight === 0 ||
  state.distance <= getBottomThreshold(state.clientHeight, thresholdPx)
