import { appendProjectProfileRememberedSystemMessage } from '../../persistence/history/project-profile-events.js'
import {
  rememberProjectProfileEntry,
  resolveProjectProfilePath,
} from '../../work/project-profile/store.js'

import {
  normalizeRememberMemoryContent,
  rememberProjectProfileSchema,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyRememberProjectProfileAction = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'remember_project_profile') return
  const parsed = rememberProjectProfileSchema.safeParse(item)
  if (!parsed.success) return
  if (resolveRememberMemoryContentIssue(parsed.data.content)) return
  const remembered = await rememberProjectProfileEntry(
    resolveProjectProfilePath(runtime.config.workDir, runtime.startup.worktree),
    {
      content: normalizeRememberMemoryContent(parsed.data.content),
      sourceInputId: parsed.data.source_input_id,
      sourceQuote: normalizeRememberMemoryContent(parsed.data.source_quote),
    },
  )
  const focusId = resolveActionFocusId(runtime)
  await appendProjectProfileRememberedSystemMessage(
    runtime.paths.history,
    focusId,
    remembered,
  )
}
