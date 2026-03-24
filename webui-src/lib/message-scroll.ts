export const BOTTOM_THRESHOLD_PX = 56

export type ScrollState = {
  clientHeight: number
  distance: number
  scrollHeight: number
  scrollTop: number
}

export const readScrollState = (element: HTMLUListElement): ScrollState => ({
  clientHeight: element.clientHeight,
  distance: element.scrollHeight - element.scrollTop - element.clientHeight,
  scrollHeight: element.scrollHeight,
  scrollTop: element.scrollTop,
})

export const isScrollStateNearBottom = (state: ScrollState): boolean =>
  state.clientHeight === 0 || state.distance <= BOTTOM_THRESHOLD_PX

export const shouldStickAfterLayoutShift = (params: {
  previousClientHeight: number
  previousScrollHeight: number
  state: ScrollState
}): boolean => {
  const previousDistance =
    params.state.distance -
    (params.state.scrollHeight - params.previousScrollHeight) +
    (params.state.clientHeight - params.previousClientHeight)

  return (
    (params.state.clientHeight !== params.previousClientHeight ||
      params.state.scrollHeight !== params.previousScrollHeight) &&
    previousDistance <= BOTTOM_THRESHOLD_PX
  )
}
