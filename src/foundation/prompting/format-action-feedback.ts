import { escapeCdata, stringifyPromptJson } from './format-base.js'

import type { ManagerActionFeedback } from '../types/index.js'

const buildRepairPayload = (
  item: ManagerActionFeedback,
): Record<string, unknown> | undefined => {
  if (item.error === 'invalid_action_syntax')
    return { kind: 'fix_action_markup' }
  if (item.error !== 'invalid_action_args') return undefined
  const hint = item.hint.trim()
  const repair: Record<string, unknown> = {
    kind: 'fix_action_args',
  }
  const issueText = hint.replace(/^参数校验失败：/, '').trim()
  const issues = issueText
    .split('；')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (issues.length > 0) repair.issues = issues
  const missingRequiredAttrs = issues
    .map((issue) =>
      issue.match(
        /^([^:]+): Invalid input: expected string, received undefined$/,
      ),
    )
    .map((match) => match?.[1]?.trim() ?? '')
    .filter((value) => value.length > 0)
  if (missingRequiredAttrs[0]) {
    repair.missing_required_attr = missingRequiredAttrs[0]
    repair.missing_required_attrs = missingRequiredAttrs
  }

  const unknownAttrs = [...issueText.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((value) => value.length > 0)
  if (unknownAttrs.length > 0) repair.unknown_attrs = unknownAttrs
  return repair
}

export const buildActionFeedbackPromptPayload = (
  feedback: ManagerActionFeedback[],
): { items: Array<Record<string, unknown>> } | undefined => {
  if (feedback.length === 0) return undefined
  const entries = feedback
    .map((item) => {
      const action = item.action.trim()
      const error = item.error.trim()
      const hint = item.hint.trim()
      if (!action || !error || !hint) return null
      const attempted = item.attempted?.trim()
      const repair = buildRepairPayload(item)
      return {
        action,
        error,
        hint,
        ...(attempted ? { attempted } : {}),
        ...(repair ? { repair } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  return entries.length === 0 ? undefined : { items: entries }
}

export const formatActionFeedback = (
  feedback: ManagerActionFeedback[],
): string => {
  const payload = buildActionFeedbackPromptPayload(feedback)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}
