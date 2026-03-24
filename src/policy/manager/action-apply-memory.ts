import { appendMemoryRememberedSystemMessage } from '../../persistence/history/memory-events.js'
import { rememberMemoryEntry } from '../../work/memory/remember-entry.js'

import {
  normalizeRememberMemoryContent,
  rememberMemorySchema,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { parseActionAttrs } from './action-parse.js'

import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyRememberMemoryAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, rememberMemorySchema)
  if (!parsed) return
  if (resolveRememberMemoryContentIssue(parsed.content)) return
  const remembered = await rememberMemoryEntry(runtime.paths.memoryFile, {
    content: normalizeRememberMemoryContent(parsed.content),
  })
  const focusId = resolveActionFocusId(runtime)
  const appended = await appendMemoryRememberedSystemMessage(
    runtime.paths.history,
    focusId,
    remembered,
  )
  if (appended) runtime.manager.memoryRefresh.signalVersion += 1
}
