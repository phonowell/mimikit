import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  assignFocusByTargetId,
  enforceActiveFocusLimit,
  pruneArchivedFocuses,
  updateFocus,
} from '../../work/focus/index.js'

import {
  assignFocusSchema,
  parseUpsertFocusAttrs,
} from './action-apply-schema.js'
import { parseActionAttrs } from './action-parse.js'

import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyUpsertFocusAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseUpsertFocusAttrs(item.attrs)
  if (!parsed) return
  updateFocus(runtime, {
    id: parsed.id,
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    ...(parsed.summary !== undefined ? { summary: parsed.summary } : {}),
    ...(parsed.openItems !== undefined ? { openItems: parsed.openItems } : {}),
  })
  await enforceActiveFocusLimit(runtime)
  await pruneArchivedFocuses(runtime)
  await persistRuntimeState(runtime)
}

export const applyAssignFocusAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, assignFocusSchema)
  if (!parsed) return
  const assigned = await assignFocusByTargetId(
    runtime,
    parsed.target_type,
    parsed.target_id,
    parsed.focus_id,
  )
  if (!assigned) return
  await enforceActiveFocusLimit(runtime)
  await pruneArchivedFocuses(runtime)
  await persistRuntimeState(runtime)
}
