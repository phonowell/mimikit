import type { ManagerActionFeedback } from '../../foundation/types/index.js'

const GENERIC_CORRECTION_REPLY =
  '继续执行前还缺 3 个最小信息，每项一句即可：1) 目标：最终要我产出什么；2) 范围与不做项：这次只处理哪里、哪些不要动；3) 验收标准：怎样算完成，至少一条。若一时说不全，请先缩成一个最小可交付结果。'

const isRetryableActionFeedback = (item: ManagerActionFeedback): boolean =>
  item.error === 'invalid_action_args'

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
  if (feedback.every((item) => item.code === 'intent_evidence_missing'))
    return '当前没有足够的直接授权来继续这一步，我先停在这里。若要继续，请直接说明要执行什么、范围是什么、怎样算完成；如果是在操作现有任务或计划，请明确指出它。'

  if (feedback.every((item) => item.code === 'task_contract_missing'))
    return '继续执行前还缺最小执行边界：goal、in_scope、done_when，以及 cwd/mode。请把这几项直接说清楚后再继续。'

  if (feedback.every((item) => item.code === 'invalid_action_args')) {
    if (feedback.every((item) => item.action === 'set_plan'))
      return '当前这轮计划没有形成合法配置，我先停在这里。若要继续，请直接说明计划要做什么、何时触发，以及对应任务边界。'

    if (feedback.every((item) => item.action === 'enqueue_task'))
      return '当前这轮执行单没有形成合法配置，我先停在这里。若要继续，请直接说明目标、范围、验收，以及 cwd/mode。'

    return '当前这轮内部执行单没有形成合法配置，我先停在这里。请换一种更直接、边界更清晰的说法重试。'
  }
  if (
    feedback.every(
      (item) =>
        item.action === 'task_control' &&
        item.error === 'action_execution_rejected',
    )
  )
    return '当前请求的任务操作现在不能执行，我先停在这里。目标任务很可能已经结束、取消，或当前状态与请求不匹配。'

  if (feedback.every((item) => item.action === first.action))
    return '当前这轮有一个内部动作没有安全通过，我先停在这里。若要继续，请把目标、范围和下一步说得更直接一些。'

  return GENERIC_CORRECTION_REPLY
}
