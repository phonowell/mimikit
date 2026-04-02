import { compareIsoAsc } from '../../foundation/shared/time.js'
import { readHistory } from '../../persistence/history/store.js'
import { removeRuntimeFocus } from '../orchestrator/runtime-domain-write.js'

import { isDefaultActiveFocusCandidate } from './reserved.js'
import { setFocusStatus } from './state.js'

import type { FocusId, FocusMeta } from '../../foundation/types/index.js'
import type { FocusRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const compareByActivityAsc = (a: FocusMeta, b: FocusMeta): number => {
  const diff = compareIsoAsc(a.lastActivityAt, b.lastActivityAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

const maxActiveFocuses = (runtime: FocusRuntime): number =>
  runtime.config.worker.maxConcurrent

const maxArchivedFocuses = (runtime: FocusRuntime): number =>
  runtime.config.worker.maxConcurrent * 2

const activeBusinessFocusCount = (runtime: FocusRuntime): number =>
  runtime.domain.focuses.filter(isDefaultActiveFocusCandidate).length

const collectReferencedFocusIds = async (
  runtime: FocusRuntime,
): Promise<Set<FocusId>> => {
  const ids = new Set<FocusId>()
  for (const task of runtime.domain.tasks) {
    const focusId = task.focusId.trim()
    if (focusId) ids.add(focusId)
  }
  for (const plan of runtime.domain.taskPlans) {
    const focusId = plan.focusId.trim()
    if (focusId) ids.add(focusId)
  }
  for (const input of runtime.process.session.inflightInputs) {
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

export const enforceActiveFocusLimit = (runtime: FocusRuntime): void => {
  const demoteCandidates = runtime.domain.focuses
    .filter(isDefaultActiveFocusCandidate)
    .sort(compareByActivityAsc)
  while (
    activeBusinessFocusCount(runtime) > maxActiveFocuses(runtime) &&
    demoteCandidates.length > 0
  ) {
    const oldest = demoteCandidates.shift()
    if (!oldest) break
    setFocusStatus(runtime, oldest.id, 'idle')
  }
}

export const pruneArchivedFocuses = async (
  runtime: FocusRuntime,
): Promise<void> => {
  const archived = runtime.domain.focuses
    .filter((item) => item.status === 'archived')
    .sort(compareByActivityAsc)
  const referencedFocusIds = await collectReferencedFocusIds(runtime)
  for (let index = 0; archived.length > maxArchivedFocuses(runtime); ) {
    const candidate = archived[index]
    if (!candidate) break
    if (referencedFocusIds.has(candidate.id)) {
      index += 1
      if (index >= archived.length) break
      continue
    }
    archived.splice(index, 1)
    removeRuntimeFocus({ runtime, focusId: candidate.id })
  }
}
