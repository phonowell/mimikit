import {
  assignFocusByTargetId,
  enforceFocusCapacity,
  ensureFocus,
  parseFocusOpenItems,
  touchFocus,
  updateFocus,
} from '../focus/index.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'

import {
  assignFocusSchema,
  createFocusSchema,
  updateFocusSchema,
} from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const applyCreateFocusAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = createFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  ensureFocus(runtime, parsed.data.id, parsed.data.title)
  if (
    parsed.data.status !== undefined ||
    parsed.data.summary !== undefined ||
    parsed.data.open_items !== undefined
  ) {
    const openItems = parseFocusOpenItems(parsed.data.open_items)
    updateFocus(runtime, {
      id: parsed.data.id,
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
      ...(openItems !== undefined ? { openItems } : {}),
    })
  }
  touchFocus(runtime, parsed.data.id)
  enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}

export const applyUpdateFocusAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = updateFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const openItems = parseFocusOpenItems(parsed.data.open_items)
  updateFocus(runtime, {
    id: parsed.data.id,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
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
