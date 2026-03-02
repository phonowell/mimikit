import {
  assignFocusByTargetId,
  enforceFocusCapacity,
  parseFocusOpenItems,
  updateFocus,
} from '../focus/index.js'

import { assignFocusSchema, upsertFocusSchema } from './action-apply-schema.js'
import { persistRuntimeState, type RuntimeState } from './runtime-adapter.js'

import type { Parsed } from '../actions/model/spec.js'

export const applyUpsertFocusAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = upsertFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const openItems = parseFocusOpenItems(parsed.data.open_items)
  updateFocus(runtime, {
    id: parsed.data.id,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.summary !== undefined
      ? { summary: parsed.data.summary }
      : {}),
    ...(openItems !== undefined ? { openItems } : {}),
  })
  enforceFocusCapacity(runtime)
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
    parsed.data.target_id,
    parsed.data.focus_id,
  )
  if (!assigned) return
  enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}
