import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  assignFocusByTargetId,
  enforceActiveFocusLimit,
  pruneArchivedFocuses,
} from '../../work/focus/index.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyAssignFocusAction = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'assign_focus') return
  const assigned = await assignFocusByTargetId(
    runtime,
    item.target_type,
    item.target_id,
    item.focus_id,
  )
  if (!assigned) return
  await enforceActiveFocusLimit(runtime)
  await pruneArchivedFocuses(runtime)
  await persistRuntimeState(runtime)
}
