import { GLOBAL_FOCUS_ID, MAX_WORKING_FOCUSES } from './constants.js'
import { ensureGlobalFocus, findFocus, setFocusStatus } from './state.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, FocusMeta } from '../types/index.js'

const compareByActivityAsc = (a: FocusMeta, b: FocusMeta): number => {
  const at = Date.parse(a.lastActivityAt)
  const bt = Date.parse(b.lastActivityAt)
  if (at !== bt) return at - bt
  return a.id.localeCompare(b.id)
}

const compareByActivityDesc = (a: FocusMeta, b: FocusMeta): number => {
  const at = Date.parse(a.lastActivityAt)
  const bt = Date.parse(b.lastActivityAt)
  if (at !== bt) return bt - at
  return a.id.localeCompare(b.id)
}

const maxActive = (runtime: RuntimeState): number =>
  runtime.config.worker.maxConcurrent

const maxArchived = (runtime: RuntimeState): number =>
  runtime.config.worker.maxConcurrent * 2

const activeCount = (runtime: RuntimeState): number =>
  runtime.focuses.filter((item) => item.status === 'active').length

export const enforceFocusCapacity = (runtime: RuntimeState): void => {
  ensureGlobalFocus(runtime)

  runtime.activeFocusIds = runtime.activeFocusIds.filter((id, index, source) => {
    if (source.indexOf(id) !== index) return false
    const focus = findFocus(runtime, id)
    return Boolean(focus && focus.status === 'active')
  })

  const demoteCandidates = runtime.focuses
    .filter((item) => item.status === 'active' && item.id !== GLOBAL_FOCUS_ID)
    .sort(compareByActivityAsc)
  while (activeCount(runtime) > maxActive(runtime) && demoteCandidates.length > 0) {
    const oldest = demoteCandidates.shift()
    if (!oldest) break
    setFocusStatus(runtime, oldest.id, 'idle')
  }

  const archived = runtime.focuses
    .filter((item) => item.status === 'archived')
    .sort(compareByActivityAsc)
  while (archived.length > maxArchived(runtime)) {
    const oldest = archived.shift()
    if (!oldest) continue
    runtime.focuses = runtime.focuses.filter((item) => item.id !== oldest.id)
    runtime.focusContexts = runtime.focusContexts.filter(
      (item) => item.focusId !== oldest.id,
    )
    runtime.activeFocusIds = runtime.activeFocusIds.filter((id) => id !== oldest.id)
  }

  if (!runtime.activeFocusIds.includes(GLOBAL_FOCUS_ID))
    runtime.activeFocusIds.unshift(GLOBAL_FOCUS_ID)
}

export const selectWorkingFocusIds = (
  runtime: RuntimeState,
  preferred: FocusId[],
): FocusId[] => {
  const ranked = runtime.focuses
    .filter((item) => item.status !== 'archived')
    .sort(compareByActivityDesc)
    .map((item) => item.id)
  const merged = Array.from(
    new Set([...preferred, ...runtime.activeFocusIds, ...ranked]),
  )
  return merged.slice(0, MAX_WORKING_FOCUSES)
}
