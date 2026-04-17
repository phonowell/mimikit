import type { Task, TaskPlan, UserInput } from '../../foundation/types/index.js'
import type { ManagerContextPacket } from '../types/manager-types.js'

export const resolveQuotedPrimaryWorkline = (params: {
  input: UserInput
  tasks: Task[]
  plans: TaskPlan[]
}): ManagerContextPacket['primaryWorkline'] | undefined => {
  if (params.input.role !== 'user') return undefined
  const sourceInputId = params.input.sourceInputIds?.[0]?.trim()
  const sourceTaskId = params.input.sourceTaskIds?.[0]?.trim()
  const sourcePlanId = params.input.sourcePlanIds?.[0]?.trim()
  if (!sourceInputId && !sourceTaskId && !sourcePlanId) return undefined

  const task = sourceTaskId
    ? params.tasks.find((item) => item.id === sourceTaskId)
    : undefined
  if (task) {
    return {
      focusId: task.focusId,
      source: 'quoted_message',
      ...(sourceInputId ? { sourceInputId } : {}),
      sourceTaskId: task.id,
      ...(sourcePlanId ? { sourcePlanId } : {}),
    }
  }

  const plan = sourcePlanId
    ? params.plans.find((item) => item.id === sourcePlanId)
    : undefined
  if (plan) {
    return {
      focusId: plan.focusId,
      source: 'quoted_message',
      ...(sourceInputId ? { sourceInputId } : {}),
      ...(sourceTaskId ? { sourceTaskId } : {}),
      sourcePlanId: plan.id,
    }
  }

  return {
    focusId: params.input.focusId,
    source: 'quoted_message',
    ...(sourceInputId ? { sourceInputId } : {}),
    ...(sourceTaskId ? { sourceTaskId } : {}),
    ...(sourcePlanId ? { sourcePlanId } : {}),
  }
}
