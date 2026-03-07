import { appendMemoryRememberedSystemMessage } from '../history/memory-events.js'
import { rememberMemoryEntry } from '../memory/remember-entry.js'

import { resolveActionFocusId } from './action-apply-create.js'
import { rememberMemorySchema } from './action-apply-schema.js'
import { parseActionAttrs } from './action-parse.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const applyRememberMemoryAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, rememberMemorySchema)
  if (!parsed) return
  const remembered = await rememberMemoryEntry(runtime.paths.memoryFile, {
    content: parsed.content,
  })
  const focusId = resolveActionFocusId(runtime)
  await appendMemoryRememberedSystemMessage(
    runtime.paths.history,
    focusId,
    remembered,
  )
}
