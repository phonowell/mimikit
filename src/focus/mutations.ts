import { newId, nowIso } from '../shared/utils.js'

import {
  byUpdatedDesc,
  cloneFocuses,
  FOCUS_DRIFT_SIMILARITY_THRESHOLD,
  focusSimilarity,
  hasEvidenceIntersection,
  normalizeEvidenceIds,
  normalizeFocusConfidence,
  resolveFocusSlots,
  trimExpiredByLru,
} from './common.js'
import { parseSyncFocusesPayload } from './sync-action.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  ConversationFocus,
  ConversationFocusSource,
} from '../types/index.js'

const hasSemanticDrift = (params: {
  previousActive: ConversationFocus[]
  nextActive: ConversationFocus[]
  batchEvidenceIds: Set<string>
}): boolean => {
  if (params.previousActive.length === 0 || params.nextActive.length === 0)
    return false

  const previousById = new Map(
    params.previousActive.map((item) => [item.id, item]),
  )
  let changed = 0
  for (const next of params.nextActive) {
    const previous = previousById.get(next.id)
    if (!previous) continue
    const similarEnough =
      focusSimilarity(previous, next) >= FOCUS_DRIFT_SIMILARITY_THRESHOLD
    if (similarEnough) continue
    const evidenceStable = hasEvidenceIntersection(
      previous.evidenceIds,
      next.evidenceIds,
    )
    if (evidenceStable) continue
    const hasFreshEvidence = next.evidenceIds.some((id) =>
      params.batchEvidenceIds.has(id),
    )
    if (hasFreshEvidence) continue
    changed += 1
  }

  return (
    changed >=
    Math.ceil(
      Math.min(params.previousActive.length, params.nextActive.length) * 0.6,
    )
  )
}

const replaceFocuses = (
  runtime: RuntimeState,
  nextActive: ConversationFocus[],
): void => {
  const maxSlots = resolveFocusSlots(runtime)
  const activeIds = new Set(nextActive.map((item) => item.id))
  const now = nowIso()
  const previousActive = runtime.focuses.filter(
    (item) => item.status === 'active',
  )
  const expired = runtime.focuses
    .filter((item) => item.status === 'expired' && !activeIds.has(item.id))
    .map((item) => ({ ...item }))

  for (const focus of previousActive) {
    if (activeIds.has(focus.id)) continue
    expired.push({
      ...focus,
      status: 'expired',
      updatedAt: now,
      lastReferencedAt: now,
      source: 'manager',
    })
  }

  runtime.focuses = [
    ...nextActive.sort(byUpdatedDesc),
    ...trimExpiredByLru(expired, maxSlots),
  ]
}

export const applyManagerFocusSync = (params: {
  runtime: RuntimeState
  action: Parsed
  batchEvidenceIds: Set<string>
}): { ok: true; changed: boolean } | { ok: false; error: string } => {
  const parsed = parseSyncFocusesPayload(params.action)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const maxSlots = resolveFocusSlots(params.runtime)
  if (parsed.payload.active.length > maxSlots)
    return { ok: false, error: `active focuses exceed slots: ${maxSlots}` }

  const previous = cloneFocuses(params.runtime.focuses)
  const previousById = new Map(previous.map((item) => [item.id, item]))
  const previousActive = previous.filter((item) => item.status === 'active')
  const now = nowIso()
  const seen = new Set<string>()
  const nextActive: ConversationFocus[] = []

  for (const item of parsed.payload.active) {
    const trimmedId = item.id?.trim()
    const id = trimmedId && trimmedId.length > 0 ? trimmedId : newId()
    if (seen.has(id)) return { ok: false, error: `duplicate focus id: ${id}` }
    seen.add(id)
    const current = previousById.get(id)
    nextActive.push({
      id,
      title: item.title,
      summary: item.summary,
      status: 'active',
      confidence: normalizeFocusConfidence(
        item.confidence ?? current?.confidence,
      ),
      evidenceIds: normalizeEvidenceIds(item.evidence_ids),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      lastReferencedAt: now,
      source: 'manager',
    })
  }

  if (
    hasSemanticDrift({
      previousActive,
      nextActive,
      batchEvidenceIds: params.batchEvidenceIds,
    })
  )
    return { ok: false, error: 'focus semantic drift too large' }

  replaceFocuses(params.runtime, nextActive)
  return {
    ok: true,
    changed:
      JSON.stringify(previous) !== JSON.stringify(params.runtime.focuses),
  }
}

const updateFocusStatus = (
  runtime: RuntimeState,
  id: string,
  status: 'active' | 'expired',
  source: ConversationFocusSource,
): {
  ok: boolean
  status: 'not_found' | 'already' | 'updated' | 'active_full'
} => {
  const focusId = id.trim()
  if (!focusId) return { ok: false, status: 'not_found' }
  const index = runtime.focuses.findIndex((item) => item.id === focusId)
  if (index < 0) return { ok: false, status: 'not_found' }
  const current = runtime.focuses[index]
  if (!current) return { ok: false, status: 'not_found' }
  if (current.status === status) return { ok: false, status: 'already' }

  const maxSlots = resolveFocusSlots(runtime)
  if (
    status === 'active' &&
    runtime.focuses.filter((item) => item.status === 'active').length >=
      maxSlots
  )
    return { ok: false, status: 'active_full' }

  const now = nowIso()
  runtime.focuses[index] = {
    ...current,
    status,
    source,
    updatedAt: now,
    lastReferencedAt: now,
  }

  const active = runtime.focuses
    .filter((item) => item.status === 'active')
    .sort(byUpdatedDesc)
  const expired = trimExpiredByLru(
    runtime.focuses.filter((item) => item.status === 'expired'),
    maxSlots,
  )
  runtime.focuses = [...active, ...expired]
  return { ok: true, status: 'updated' }
}

export const expireFocus = (runtime: RuntimeState, id: string) =>
  updateFocusStatus(runtime, id, 'expired', 'user')

export const restoreFocus = (runtime: RuntimeState, id: string) =>
  updateFocusStatus(runtime, id, 'active', 'user')

export const getFocusSnapshot = (runtime: RuntimeState) => {
  const limit = resolveFocusSlots(runtime)
  const active = runtime.focuses
    .filter((item) => item.status === 'active')
    .sort(byUpdatedDesc)
  const expired = trimExpiredByLru(
    runtime.focuses.filter((item) => item.status === 'expired'),
    limit,
  )
  return { limit, active: cloneFocuses(active), expired: cloneFocuses(expired) }
}
