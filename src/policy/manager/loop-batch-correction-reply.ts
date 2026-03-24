import { clipCompactText } from '../../foundation/shared/text.js'
import {
  extractAttrText,
  extractTagNameFromRaw,
  parseAttributes,
} from '../actions/protocol/meta-tag-attrs.js'

import { isTaskContractMissingHint } from './action-feedback-contract-hint.js'

import type { ManagerActionFeedback } from '../../foundation/types/index.js'

type RejectedActionClass =
  | 'insufficient_evidence'
  | 'task_state_conflict'
  | 'needs_scope_confirmation'
  | 'channel_choice_unsupported'
  | 'result_not_available'
  | 'blocked_action'

const GENERIC_CORRECTION_REPLY =
  '继续执行前还缺 3 个最小信息，每项一句即可：1) 目标：最终要我产出什么；2) 范围与不做项：这次只处理哪里、哪些不要动；3) 验收标准：怎样算完成，至少一条。若一时说不全，请先缩成一个最小可交付结果。'

const REJECTION_CLASS_REPLY: Record<RejectedActionClass, string> = {
  insufficient_evidence:
    '当前高风险动作缺少可核实证据，本轮先停止重试。请先补充明确用户目标；若需要用户决定，再直接向用户确认。',
  task_state_conflict:
    '当前动作和任务状态冲突，本轮停止重复尝试。请改为确认该任务是否应继续等待、恢复，或换一个仍可执行的目标。',
  needs_scope_confirmation: `当前派发动作缺少继续执行所需边界。本轮先停止重试；${GENERIC_CORRECTION_REPLY}`,
  channel_choice_unsupported:
    '当前输入来源不支持这类确认动作。本轮先停止重试；请直接提供明确决定，或改用无需交互选择的下一步。',
  result_not_available:
    '当前批次没有可直接消费的结果，本轮先停止重试。请等待任务继续产出结果，或明确指定要查看/恢复的任务。',
  blocked_action: GENERIC_CORRECTION_REPLY,
}

export const findRepeatedRejectedAction = (
  feedback: ManagerActionFeedback[],
): string | undefined => {
  const counts = new Map<string, number>()
  for (const item of feedback) {
    if (item.error !== 'action_execution_rejected') continue
    const next = (counts.get(item.action) ?? 0) + 1
    counts.set(item.action, next)
    if (next >= 2) return item.action
  }
  return undefined
}

const isIntentEvidenceHint = (hint: string): boolean =>
  hint.includes('intent-evidence guard 未通过')

const parseAttemptedAttrs = (
  attempted: string | undefined,
): Record<string, string> | undefined => {
  const raw = attempted?.trim()
  if (!raw) return undefined
  const fullName = extractTagNameFromRaw(raw)
  if (!fullName) return undefined
  return parseAttributes(extractAttrText(raw, fullName))
}

const readAttemptedAttr = (
  attempted: string | undefined,
  key: 'title' | 'goal',
): string | undefined => {
  const value = parseAttemptedAttrs(attempted)?.[key]?.trim()
  return value && value.length > 0 ? value : undefined
}

const buildAttemptedFollowupLabel = (
  item: ManagerActionFeedback,
): string | undefined => {
  const title = readAttemptedAttr(item.attempted, 'title')
  if (title) return clipCompactText(title, 48)
  const goal = readAttemptedAttr(item.attempted, 'goal')
  if (goal) return clipCompactText(goal, 72)
  return undefined
}

const buildIntentEvidenceReply = (
  feedback: ManagerActionFeedback[],
): string | undefined => {
  const first = feedback.find((item) => isIntentEvidenceHint(item.hint))
  if (!first) return undefined
  const followupLabel = buildAttemptedFollowupLabel(first)
  if (!followupLabel) return undefined
  if (first.action === 'enqueue_task')
    return `当前高风险动作缺少可核实证据，本轮先停止重试。系统原本想继续：${followupLabel}。但这类 follow-up 不能只靠 task_result 等补充信息自动派发；如果要继续，请直接说明要我继续这一项，并补一句范围/验收。`

  return `当前高风险动作缺少可核实证据，本轮先停止重试。系统原本想执行：${followupLabel}。但这类动作不能只靠 task_result 等补充信息自动触发；如果要继续，请先给出明确指令。`
}

const classifyRejectedActionFeedback = (
  item: ManagerActionFeedback,
): RejectedActionClass => {
  if (item.error !== 'action_execution_rejected') return 'blocked_action'
  if (isIntentEvidenceHint(item.hint)) return 'insufficient_evidence'
  if (item.action === 'mutate_task') return 'task_state_conflict'
  if (item.action === 'enqueue_task') return 'needs_scope_confirmation'
  if (item.action === 'ask_user_choice') return 'channel_choice_unsupported'
  if (item.action === 'set_task_result_summary') return 'result_not_available'
  return 'blocked_action'
}

export const resolveDominantRejectedClass = (
  feedback: ManagerActionFeedback[],
): RejectedActionClass | undefined => {
  const counts = new Map<RejectedActionClass, number>()
  let dominant: RejectedActionClass | undefined
  let max = 0
  for (const item of feedback) {
    if (item.error !== 'action_execution_rejected') continue
    const nextClass = classifyRejectedActionFeedback(item)
    const nextCount = (counts.get(nextClass) ?? 0) + 1
    counts.set(nextClass, nextCount)
    if (nextCount > max) {
      dominant = nextClass
      max = nextCount
    }
  }
  return dominant
}

const buildDirectActionFeedbackReply = (
  feedback: ManagerActionFeedback[],
): string | undefined => {
  const first = feedback[0]
  if (!first) return undefined
  if (
    feedback.length === 1 &&
    !isIntentEvidenceHint(first.hint) &&
    (first.error !== 'action_execution_rejected' ||
      !isTaskContractMissingHint(first.hint))
  )
    return `当前动作无法继续执行，本轮先停止重试。${first.hint}`
  const allSameAction = feedback.every((item) => item.action === first.action)
  const allNonRejected = feedback.every(
    (item) => item.error !== 'action_execution_rejected',
  )
  if (allSameAction && allNonRejected) {
    const uniqueHints = [
      ...new Set(feedback.map((item) => item.hint.trim())),
    ].filter((hint) => hint.length > 0)
    if (uniqueHints.length === 0) return undefined
    return `当前 ${first.action} 动作参数或格式仍有问题，本轮先停止重试。请先修正以下问题后再继续：${uniqueHints.join('；')}`
  }
  return undefined
}

const isSelfRepairableActionFeedback = (item: ManagerActionFeedback): boolean =>
  item.error === 'invalid_action_args' || item.error === 'invalid_action_syntax'

export const shouldRetrySelfRepairRound = (
  round: number,
  feedback: ManagerActionFeedback[],
): boolean =>
  round === 2 &&
  feedback.length > 0 &&
  feedback.every((item) => isSelfRepairableActionFeedback(item))

export const buildCorrectionFallbackReply = (
  feedback: ManagerActionFeedback[],
): string => {
  const repeatedRejectedAction = findRepeatedRejectedAction(feedback)
  if (repeatedRejectedAction)
    return `同类动作 ${repeatedRejectedAction} 已连续被拒绝，本轮停止重试。${REJECTION_CLASS_REPLY[resolveDominantRejectedClass(feedback) ?? 'blocked_action']}`
  const directActionFeedbackReply = buildDirectActionFeedbackReply(feedback)
  if (directActionFeedbackReply) return directActionFeedbackReply
  const intentEvidenceReply = buildIntentEvidenceReply(feedback)
  if (intentEvidenceReply) return intentEvidenceReply
  const dominantRejectedClass = resolveDominantRejectedClass(feedback)
  if (dominantRejectedClass) return REJECTION_CLASS_REPLY[dominantRejectedClass]
  return GENERIC_CORRECTION_REPLY
}
