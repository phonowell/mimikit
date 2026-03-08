import type { TaskContract } from '../types/index.js'

export const TASK_CONTRACT_REQUIRED_HINT =
  'enqueue_task 执行失败：缺少 task contract。请提供 goal/scope 与至少 1 条 acceptance_{n}。'

const normalizeLine = (value?: string): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const collectSequentialValues = (
  attrs: Record<string, string | undefined>,
  prefix: 'acceptance' | 'context_ref',
  max: number,
): string[] => {
  const values: string[] = []
  for (let index = 1; index <= max; index += 1) {
    const key = `${prefix}_${index}`
    const value = normalizeLine(attrs[key])
    if (!value) continue
    values.push(value)
  }
  return values
}

export const buildTaskContractFromAttrs = (
  attrs: Record<string, string | undefined>,
): TaskContract | undefined => {
  const goal = normalizeLine(attrs.goal)
  const scope = normalizeLine(attrs.scope)
  const acceptance = collectSequentialValues(attrs, 'acceptance', 5)
  if (!goal || !scope || acceptance.length === 0) return undefined
  const contextRefs = collectSequentialValues(attrs, 'context_ref', 3)
  const outOfScope = normalizeLine(attrs.out_of_scope)
  return {
    goal,
    scope,
    acceptance,
    ...(outOfScope ? { outOfScope } : {}),
    ...(contextRefs.length > 0 ? { contextRefs } : {}),
  }
}
