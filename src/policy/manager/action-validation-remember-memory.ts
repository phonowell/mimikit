import {
  type RememberMemoryContentIssue,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import {
  formatRememberMemoryNotStableHint,
  formatStableDigestIssueHint,
} from './action-feedback-hints-basic.js'
import { validateRememberMemoryIntentEvidence } from './action-intent-evidence-dialog-memory.js'
import {
  suppressed,
  type ValidationIssue,
} from './action-validation-helpers.js'
import { rememberMemoryActionSchema } from './manager-turn-schema.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { UserInput } from '../../foundation/types/index.js'

type RememberMemoryValidationContext = {
  inputs?: UserInput[]
}

const formatRememberMemoryIssue = (issue: RememberMemoryContentIssue): string =>
  formatStableDigestIssueHint(issue)

export const validateRememberMemoryAction = (
  item: Parsed,
  context: RememberMemoryValidationContext,
): ValidationIssue[] => {
  if (item.type !== 'remember_memory') return []
  const result = rememberMemoryActionSchema.safeParse(item)
  if (!result.success) return []

  const contentIssue = resolveRememberMemoryContentIssue(result.data.content)
  if (contentIssue) {
    return suppressed(
      formatRememberMemoryNotStableHint(
        formatRememberMemoryIssue(contentIssue),
      ),
    )
  }

  const evidenceResult = validateRememberMemoryIntentEvidence({
    item,
    ...(context.inputs ? { inputs: context.inputs } : {}),
  })
  return evidenceResult ? suppressed(evidenceResult) : []
}
