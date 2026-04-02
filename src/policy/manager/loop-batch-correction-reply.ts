import type { ManagerActionFeedback } from '../../foundation/types/index.js'

const GENERIC_CORRECTION_REPLY =
  '继续执行前还缺 3 个最小信息，每项一句即可：1) 目标：最终要我产出什么；2) 范围与不做项：这次只处理哪里、哪些不要动；3) 验收标准：怎样算完成，至少一条。若一时说不全，请先缩成一个最小可交付结果。'

const collectUniqueHints = (feedback: ManagerActionFeedback[]): string[] =>
  [...new Set(feedback.map((item) => item.hint.trim()))].filter(
    (hint) => hint.length > 0,
  )

const isRetryableActionFeedback = (item: ManagerActionFeedback): boolean =>
  item.error === 'invalid_action_args' ||
  item.code === 'missing_result_followup_action'

export const shouldRetrySelfRepairRound = (
  round: number,
  feedback: ManagerActionFeedback[],
): boolean =>
  round === 2 &&
  feedback.length > 0 &&
  feedback.every((item) => isRetryableActionFeedback(item))

export const buildCorrectionFallbackReply = (
  feedback: ManagerActionFeedback[],
): string => {
  const first = feedback[0]
  if (!first) return GENERIC_CORRECTION_REPLY
  const uniqueHints = collectUniqueHints(feedback)
  if (uniqueHints.length === 0) return GENERIC_CORRECTION_REPLY
  if (feedback.every((item) => item.code === 'missing_result_followup_action'))
    return `当前结果回合还缺一个具体的继续推进动作，本轮先停止重试。${uniqueHints.join('；')}`
  if (feedback.every((item) => item.action === first.action))
    return `当前 ${first.action} 动作无法继续执行，本轮先停止重试。${uniqueHints.join('；')}`

  return `当前动作无法继续执行，本轮先停止重试。${uniqueHints.join('；')}`
}
