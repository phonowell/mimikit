import { TASK_CONTRACT_REQUIRED_HINT } from './task-contract.js'

import type { Parsed } from '../actions/model/spec.js'

const FALLBACK_PROMPT = '请在此填写任务目标'
const FALLBACK_TITLE = '补全任务契约并执行'
const FALLBACK_GOAL = '完成用户请求的可交付结果'
const FALLBACK_SCOPE = '单个 worker 任务端到端闭环'
const FALLBACK_ACCEPTANCE = '返回可验证结果与关键产出'

const trimOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

const escapeAttrValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const buildSuggestedAction = (params: {
  prompt: string
  title: string
  goal: string
  scope: string
  acceptance1: string
}): string =>
  `<M:enqueue_task prompt="${escapeAttrValue(params.prompt)}" title="${escapeAttrValue(params.title)}" goal="${escapeAttrValue(params.goal)}" scope="${escapeAttrValue(params.scope)}" acceptance_1="${escapeAttrValue(params.acceptance1)}" />`

export const isTaskContractMissingHint = (hint: string): boolean =>
  hint.includes(TASK_CONTRACT_REQUIRED_HINT)

export const buildTaskContractMissingHintFromAction = (
  item: Parsed,
): string | undefined => {
  if (item.name !== 'enqueue_task') return undefined
  const prompt = trimOrFallback(item.attrs.prompt, FALLBACK_PROMPT)
  const title = trimOrFallback(item.attrs.title, FALLBACK_TITLE)
  const goal = trimOrFallback(item.attrs.goal, FALLBACK_GOAL)
  const scope = trimOrFallback(item.attrs.scope, FALLBACK_SCOPE)
  const acceptance1 = trimOrFallback(
    item.attrs.acceptance_1,
    FALLBACK_ACCEPTANCE,
  )
  const action = buildSuggestedAction({
    prompt,
    title,
    goal,
    scope,
    acceptance1,
  })
  return [
    `${TASK_CONTRACT_REQUIRED_HINT}请直接改成下面格式后重试：`,
    action,
  ].join('\n')
}
