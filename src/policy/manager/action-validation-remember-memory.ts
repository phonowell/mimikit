import {
  type RememberMemoryContentIssue,
  rememberMemorySchema,
  resolveRememberMemoryContentIssue,
} from './action-apply-schema.js'
import { formatRememberMemoryNotStableHint } from './action-feedback-hints.js'
import { validateRememberMemoryIntentEvidence } from './action-intent-evidence-dialog-memory.js'
import { collectUserIntentTexts } from './action-intent-evidence-match.js'
import { parseActionAttrs } from './action-parse.js'
import {
  rejected,
  suppressed,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type RememberMemoryValidationContext = {
  inputs?: UserInput[]
  recentUserIntentTexts?: string[]
}

const formatRememberMemoryIssue = (
  issue: RememberMemoryContentIssue,
): string => {
  if (issue === 'multiline') return '包含多行文本；请收敛为单行 digest。'
  if (issue === 'checklist') return '包含 checklist 或步骤列表。'
  if (issue === 'protocol') return '包含协议标签或代码块。'
  if (issue === 'runtime_ref')
    return '包含 task-/plan-/focus- 等运行时对象引用。'
  return '超过 240 字符上限。'
}

export const validateRememberMemoryAction = (
  item: Parsed,
  context: RememberMemoryValidationContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, rememberMemorySchema)
  if (!parsed) return []

  const contentIssue = resolveRememberMemoryContentIssue(parsed.content)
  if (contentIssue) {
    return rejected(
      formatRememberMemoryNotStableHint(
        formatRememberMemoryIssue(contentIssue),
      ),
    )
  }

  const result = validateRememberMemoryIntentEvidence({
    item,
    inputTexts: collectUserIntentTexts(context.inputs),
    ...(context.recentUserIntentTexts
      ? { recentUserIntentTexts: context.recentUserIntentTexts }
      : {}),
  })
  return result === 'suppressed' ? suppressed('remember_memory_guard') : []
}
