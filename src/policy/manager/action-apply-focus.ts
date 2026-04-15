import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { assignFocusByTargetId } from '../../work/focus/assign.js'
import {
  enforceActiveFocusLimit,
  pruneArchivedFocuses,
} from '../../work/focus/capacity.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

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
