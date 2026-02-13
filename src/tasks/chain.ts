import type {
  Task,
  TaskNextCondition,
  TaskNextDef,
  TaskResultStatus,
} from '../types/index.js'

const normalizeCondition = (
  condition?: TaskNextCondition,
): TaskNextCondition => {
  if (condition === undefined) return 'succeeded'
  return condition
}

const isConditionMatched = (
  condition: TaskNextCondition,
  status: TaskResultStatus,
): boolean => {
  if (condition === 'any') return true
  return condition === status
}

export const resolveNextTasks = (
  task: Task,
  resultStatus: TaskResultStatus,
): TaskNextDef[] => {
  if (!task.next || task.next.length === 0) return []
  return task.next.filter((item) =>
    isConditionMatched(normalizeCondition(item.condition), resultStatus),
  )
}
