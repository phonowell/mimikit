import {
  type RememberMemoryContentIssue,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import {
  formatRememberMemoryNotStableHint,
  formatStableDigestIssueHint,
} from './action-feedback-hints-basic.js'
import {
  suppressed,
  type ValidationIssue,
} from './action-validation-helpers.js'
import { rememberProjectProfileActionSchema } from './manager-turn-schema.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { UserInput } from '../../foundation/types/index.js'

type RememberProjectProfileValidationContext = {
  inputs?: UserInput[]
}

const formatRememberProjectProfileSourceInputHint = (): string =>
  'remember_project_profile 只允许引用本轮可见输入；source_input_id 未命中当前输入时直接丢弃该辅助写入。'

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

  const inputIds = new Set((context.inputs ?? []).map((input) => input.id))
  if (!inputIds.has(result.data.source_input_id))
    return suppressed(formatRememberProjectProfileSourceInputHint())

  return []
}
