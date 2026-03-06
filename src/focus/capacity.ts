import { readHistory } from '../history/store.js'
import { compareIsoAsc, compareIsoDesc } from '../shared/time.js'

import { GLOBAL_FOCUS_ID, MAX_WORKING_FOCUSES } from './constants.js'
import { isBusinessActiveFocus } from './reserved.js'
import { removeFocusCompressedContexts } from './state-context.js'
import { ensureGlobalFocus, findFocus, setFocusStatus } from './state.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, FocusMeta } from '../types/index.js'

const compareByActivityAsc = (a: FocusMeta, b: FocusMeta): number => {
  const diff = compareIsoAsc(a.lastActivityAt, b.lastActivityAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

const compareByActivityDesc = (a: FocusMeta, b: FocusMeta): number => {
  const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

const maxActive = (runtime: RuntimeState): number =>
  runtime.config.worker.maxConcurrent

const maxArchived = (runtime: RuntimeState): number =>
  runtime.config.worker.maxConcurrent * 2

const activeBusinessCount = (runtime: RuntimeState): number =>
  runtime.focuses.filter(isBusinessActiveFocus).length

const collectReferencedFocusIds = async (
  runtime: RuntimeState,
): Promise<Set<FocusId>> => {
  const ids = new Set<FocusId>()
  for (const task of runtime.tasks) {
    const focusId = task.focusId.trim()
    if (focusId) ids.add(focusId)
  }
  for (const plan of runtime.taskPlans) {
    const focusId = plan.focusId.trim()
    if (focusId) ids.add(focusId)
  }
  for (const input of runtime.inflightInputs) {
    const focusId = input.focusId.trim()
    if (focusId) ids.add(focusId)
  }
  const history = await readHistory(runtime.paths.history)
  for (const message of history) {
    const focusId = message.focusId.trim()
    if (focusId) ids.add(focusId)
  }
  return ids
}

export const enforceFocusCapacity = async (
  runtime: RuntimeState,
): Promise<void> => {
  ensureGlobalFocus(runtime)

  runtime.activeFocusIds = runtime.activeFocusIds.filter(
    (id, index, source) => {
      if (source.indexOf(id) !== index) return false
      const focus = findFocus(runtime, id)
      return Boolean(focus?.status === 'active')
    },
  )

  const demoteCandidates = runtime.focuses
    .filter(isBusinessActiveFocus)
    .sort(compareByActivityAsc)
  while (
    activeBusinessCount(runtime) > maxActive(runtime) &&
    demoteCandidates.length > 0
  ) {
    const oldest = demoteCandidates.shift()
    if (!oldest) break
    setFocusStatus(runtime, oldest.id, 'idle')
  }

  const archived = runtime.focuses
    .filter((item) => item.status === 'archived')
    .sort(compareByActivityAsc)
  const referencedFocusIds = await collectReferencedFocusIds(runtime)
  for (let index = 0; archived.length > maxArchived(runtime); ) {
    const candidate = archived[index]
    if (!candidate) break
    if (referencedFocusIds.has(candidate.id)) {
      index += 1
      if (index >= archived.length) break
      continue
    }
    archived.splice(index, 1)
    runtime.focuses = runtime.focuses.filter((item) => item.id !== candidate.id)
    runtime.focusContexts = runtime.focusContexts.filter(
      (item) => item.focusId !== candidate.id,
    )
    removeFocusCompressedContexts(runtime, [candidate.id])
    runtime.activeFocusIds = runtime.activeFocusIds.filter(
      (id) => id !== candidate.id,
    )
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
