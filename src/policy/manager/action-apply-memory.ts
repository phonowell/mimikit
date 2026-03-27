import { appendMemoryRememberedSystemMessage } from '../../persistence/history/memory-events.js'
import { rememberMemoryEntry } from '../../work/memory/remember-entry.js'

import {
  normalizeRememberMemoryContent,
  rememberMemorySchema,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyRememberMemoryAction = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'remember_memory') return
  const parsed = rememberMemorySchema.safeParse(item)
  if (!parsed.success) return
  if (resolveRememberMemoryContentIssue(parsed.data.content)) return
  const remembered = await rememberMemoryEntry(runtime.paths.memoryFile, {
    content: normalizeRememberMemoryContent(parsed.data.content),
  })
  const focusId = resolveActionFocusId(runtime)
  const appended = await appendMemoryRememberedSystemMessage(
    runtime.paths.history,
    focusId,
    remembered,
  )
  if (appended) runtime.manager.memoryRefresh.signalVersion += 1
}
