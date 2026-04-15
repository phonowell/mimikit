import {
  clipCompactText,
  normalizeInlineWhitespace,
} from '../../foundation/shared/text.js'
import { appendMemoryRememberedSystemMessage } from '../../persistence/history/memory-events.js'
import { rememberMemoryEntry } from '../../work/memory/remember-entry.js'

import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import {
  normalizeRememberMemoryContent,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { formatAuxiliaryWriteFailedHint } from './action-feedback-hints-basic.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { rememberMemoryActionSchema } from './manager-turn-schema.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const applyRememberMemoryAction = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'remember_memory') return
  const parsed = rememberMemoryActionSchema.safeParse(item)
  if (!parsed.success) return
  if (resolveRememberMemoryContentIssue(parsed.data.content)) return
  let remembered
  try {
    remembered = await rememberMemoryEntry(runtime.paths.memoryFile, {
      content: normalizeRememberMemoryContent(parsed.data.content),
    })
  } catch (error) {
    const reason = clipCompactText(
      normalizeInlineWhitespace(
        error instanceof Error ? error.message : String(error),
      ) || 'unknown write error',
      160,
    )
    throw new ActionApplyFeedbackError({
      action: 'remember_memory',
      error: 'action_execution_rejected',
      hint: formatAuxiliaryWriteFailedHint('remember_memory', reason),
    })
  }
  const focusId = resolveActionFocusId(runtime)
  const appended = await appendMemoryRememberedSystemMessage(
    runtime.paths.history,
    focusId,
    remembered,
  )
  if (appended) runtime.process.manager.memoryRefresh.signalVersion += 1
}
