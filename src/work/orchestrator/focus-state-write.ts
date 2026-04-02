import type { FocusId, FocusMeta } from '../../foundation/types/index.js'
import type {
  RuntimeFocusCollection,
  RuntimeFocusStateSlice,
} from '../../kernel/orchestrator/runtime-interfaces.js'

const findFocusIndex = (
  focuses: RuntimeFocusCollection,
  focusId: FocusId,
): number => focuses.findIndex((focus) => focus.id === focusId)

export const findRuntimeFocus = (
  runtime: RuntimeFocusStateSlice,
  focusId: FocusId,
): FocusMeta | undefined =>
  runtime.domain.focuses.find((focus) => focus.id === focusId)

export const appendRuntimeFocus = (params: {
  runtime: RuntimeFocusStateSlice
  focus: FocusMeta
}): FocusMeta => {
  params.runtime.domain.focuses = [
    ...params.runtime.domain.focuses,
    params.focus,
  ]
  return params.focus
}

export const removeRuntimeFocus = (params: {
  runtime: RuntimeFocusStateSlice
  focusId: FocusId
}): FocusMeta | undefined => {
  const index = findFocusIndex(params.runtime.domain.focuses, params.focusId)
  if (index < 0) return undefined
  const focus = params.runtime.domain.focuses[index]
  params.runtime.domain.focuses = params.runtime.domain.focuses.filter(
    (item) => item.id !== params.focusId,
  )
  return focus
}
