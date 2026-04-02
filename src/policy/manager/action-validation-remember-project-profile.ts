import {
  type RememberMemoryContentIssue,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import {
  formatRememberMemoryNotStableHint,
  formatStableDigestIssueHint,
} from './action-feedback-hints.js'
import { validateRememberProjectProfileIntentEvidence } from './action-intent-evidence-dialog-memory.js'
import {
  suppressed,
  type ValidationIssue,
} from './action-validation-helpers.js'
import { rememberProjectProfileActionSchema } from './manager-turn-schema.js'

import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type RememberProjectProfileValidationContext = {
  inputs?: UserInput[]
}

const formatRememberProjectProfileIssue = (
  issue: RememberMemoryContentIssue,
): string => formatStableDigestIssueHint(issue)

export const validateRememberProjectProfileAction = (
  item: Parsed,
  context: RememberProjectProfileValidationContext,
): ValidationIssue[] => {
  if (item.type !== 'remember_project_profile') return []
  const result = rememberProjectProfileActionSchema.safeParse(item)
  if (!result.success) return []

  const contentIssue = resolveRememberMemoryContentIssue(result.data.content)
  if (contentIssue) {
    return suppressed(
      formatRememberMemoryNotStableHint(
        formatRememberProjectProfileIssue(contentIssue),
      ),
    )
  }

  const evidenceResult = validateRememberProjectProfileIntentEvidence({
    item,
    ...(context.inputs ? { inputs: context.inputs } : {}),
  })
  return evidenceResult ? suppressed(evidenceResult) : []
}
