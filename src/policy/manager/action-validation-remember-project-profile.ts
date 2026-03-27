import {
  type RememberMemoryContentIssue,
  rememberProjectProfileSchema,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { formatRememberMemoryNotStableHint } from './action-feedback-hints.js'
import { validateRememberProjectProfileIntentEvidence } from './action-intent-evidence-dialog-memory.js'
import {
  rejected,
  suppressed,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type RememberProjectProfileValidationContext = {
  inputs?: UserInput[]
}

const formatRememberProjectProfileIssue = (
  issue: RememberMemoryContentIssue,
): string => {
  if (issue === 'multiline') return '包含多行文本；请收敛为单行 digest。'
  if (issue === 'checklist') return '包含 checklist 或步骤列表。'
  if (issue === 'protocol') return '包含协议标签或代码块。'
  if (issue === 'runtime_ref')
    return '包含 task-/plan-/focus- 等运行时对象引用。'
  return '超过 240 字符上限。'
}

export const validateRememberProjectProfileAction = (
  item: Parsed,
  context: RememberProjectProfileValidationContext,
): ValidationIssue[] => {
  if (item.type !== 'remember_project_profile') return []
  const result = rememberProjectProfileSchema.safeParse(item)
  if (!result.success) return []

  const contentIssue = resolveRememberMemoryContentIssue(result.data.content)
  if (contentIssue) {
    return rejected(
      formatRememberMemoryNotStableHint(
        formatRememberProjectProfileIssue(contentIssue),
      ),
    )
  }

  const evidenceResult = validateRememberProjectProfileIntentEvidence({
    item,
    ...(context.inputs ? { inputs: context.inputs } : {}),
  })
  return evidenceResult === 'suppressed'
    ? suppressed('remember_project_profile_guard')
    : []
}
