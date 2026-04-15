import {
  clipCompactText,
  normalizeInlineWhitespace,
} from '../../foundation/shared/text.js'
import { appendProjectProfileRememberedSystemMessage } from '../../persistence/history/project-profile-events.js'
import {
  rememberProjectProfileEntry,
  resolveProjectProfilePath,
} from '../../work/project-profile/store.js'

import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import {
  normalizeRememberMemoryContent,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { formatAuxiliaryWriteFailedHint } from './action-feedback-hints-basic.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { rememberProjectProfileActionSchema } from './manager-turn-schema.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const applyRememberProjectProfileAction = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'remember_project_profile') return
  const parsed = rememberProjectProfileActionSchema.safeParse(item)
  if (!parsed.success) return
  if (resolveRememberMemoryContentIssue(parsed.data.content)) return
  let remembered
  try {
    remembered = await rememberProjectProfileEntry(
      resolveProjectProfilePath(
        runtime.config.workDir,
        runtime.startup.worktree,
      ),
      {
        content: normalizeRememberMemoryContent(parsed.data.content),
        sourceInputId: parsed.data.source_input_id,
        ...(parsed.data.source_quote
          ? {
              sourceQuote: normalizeRememberMemoryContent(
                parsed.data.source_quote,
              ),
            }
          : {}),
      },
    )
  } catch (error) {
    const reason = clipCompactText(
      normalizeInlineWhitespace(
        error instanceof Error ? error.message : String(error),
      ) || 'unknown write error',
      160,
    )
    throw new ActionApplyFeedbackError({
      action: 'remember_project_profile',
      error: 'action_execution_rejected',
      hint: formatAuxiliaryWriteFailedHint('remember_project_profile', reason),
    })
  }
  const focusId = resolveActionFocusId(runtime)
  await appendProjectProfileRememberedSystemMessage(
    runtime.paths.history,
    focusId,
    remembered,
  )
}
