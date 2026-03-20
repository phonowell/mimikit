import type { TaskContract } from '../types/index.js'

export const TASK_CONTRACT_REQUIRED_HINT =
  'enqueue_task 执行失败：继续派发前还缺 3 个最小信息，每项一句即可：goal（最终要什么结果）、in_scope/out_of_scope（这次做什么、哪些不做）、至少一条 done_when_{n}（怎样算完成）。'

const normalizeLine = (value?: string): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const collectSequentialValues = (
  attrs: Record<string, string | undefined>,
  prefix: 'done_when' | 'context_ref',
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

const buildGeneratedWorkerPrompt = (params: {
  title?: string | undefined
  goal: string
  inScope: string
  doneWhen: string[]
  outOfScope?: string | undefined
  contextRefs?: string[] | undefined
}): string => {
  const lines = [
    params.title?.trim() ? `任务标题：${params.title.trim()}` : '',
    `目标：${params.goal}`,
    `执行范围：${params.inScope}`,
    params.outOfScope?.trim() ? `不做：${params.outOfScope.trim()}` : '',
    params.contextRefs && params.contextRefs.length > 0
      ? `上下文引用：${params.contextRefs.join('；')}`
      : '',
    '完成标准：',
    ...params.doneWhen.map((item, index) => `${index + 1}. ${item}`),
  ].filter((item) => item.length > 0)
  return lines.join('\n')
}

export const buildTaskContractFromAttrs = (
  attrs: Record<string, string | undefined>,
): TaskContract | undefined => {
  const goal = normalizeLine(attrs.goal)
  const scope = normalizeLine(attrs.in_scope)
  const acceptance = collectSequentialValues(attrs, 'done_when', 5)
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

export const resolveWorkerPromptFromAttrs = (
  attrs: Record<string, string | undefined>,
): string | undefined => {
  const workerPrompt = normalizeLine(attrs.worker_prompt)
  if (workerPrompt) return workerPrompt
  const contract = buildTaskContractFromAttrs(attrs)
  if (!contract) return undefined
  return buildGeneratedWorkerPrompt({
    title: normalizeLine(attrs.title),
    goal: contract.goal,
    inScope: contract.scope,
    doneWhen: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: contract.contextRefs } : {}),
  })
}
