import {
  assignFocusByTargetId,
  enforceFocusCapacity,
  updateFocus,
} from '../focus/index.js'

import {
  assignFocusSchema,
  parseUpsertFocusAttrs,
} from './action-apply-schema.js'
import { persistRuntimeState, type RuntimeState } from './runtime-adapter.js'

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
  await enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}

export const applyAssignFocusAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = assignFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const assigned = await assignFocusByTargetId(
    runtime,
    parsed.data.target_type,
    parsed.data.target_id,
    parsed.data.focus_id,
  )
  if (!assigned) return
  await enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}
