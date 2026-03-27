import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'

import type { ManagerTaskDraft } from './manager-turn-schema.js'
import type { TaskContract } from '../../foundation/types/index.js'

export const TASK_CONTRACT_REQUIRED_HINT =
  'enqueue_task 执行失败：`task` 合同不完整。至少需要明确 goal、in_scope、至少一条 done_when，以及有效的 cwd/mode。'

const taskContractWorkerPromptTemplateSchema = z
  .object({
    body: z.string().trim().min(1),
  })
  .strict()

const {
  path: taskContractWorkerPromptPath,
  templates: taskContractWorkerPromptTemplates,
} = loadYamlPromptTemplates({
  relativePath: 'manager/task-contract-worker-prompt.md',
  schema: taskContractWorkerPromptTemplateSchema,
})

const renderTaskContractWorkerPrompt = createPromptTemplateRenderer({
  path: taskContractWorkerPromptPath,
  templates: {
    body: taskContractWorkerPromptTemplates.body,
  },
})

const normalizeLine = (value?: string): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const normalizeList = (values: readonly string[]): string[] =>
  values.map((item) => item.trim()).filter((item) => item.length > 0)

const joinList = (values: readonly string[]): string | undefined => {
  const normalized = normalizeList(values)
  return normalized.length > 0 ? normalized.join('；') : undefined
}

const buildGeneratedWorkerPrompt = (params: {
  title?: string | undefined
  goal: string
  inScope: string
  doneWhen: string[]
  outOfScope?: string | undefined
  contextRefs?: string[] | undefined
}): string => {
  const title = params.title?.trim()
  const outOfScope = params.outOfScope?.trim()
  const contextRefs = params.contextRefs?.filter(
    (item) => item.trim().length > 0,
  )
  return renderTaskContractWorkerPrompt('body', {
    title_line: title ? `任务标题：${title}` : '',
    goal: params.goal,
    in_scope: params.inScope,
    out_of_scope_line: outOfScope ? `不做：${outOfScope}` : '',
    context_refs_line:
      contextRefs && contextRefs.length > 0
        ? `上下文引用：${contextRefs.join('；')}`
        : '',
    done_when_block: params.doneWhen
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n'),
  })
}

export const buildTaskContractFromDraft = (
  draft: ManagerTaskDraft,
): TaskContract | undefined => {
  const goal = normalizeLine(draft.goal)
  const scope = joinList(draft.in_scope)
  if (!goal || !scope || draft.done_when.length === 0) return undefined
  const outOfScope = joinList(draft.out_of_scope)
  const contextRefs = normalizeList(draft.context_refs)
  const acceptance = normalizeList(draft.done_when)
  if (acceptance.length === 0) return undefined
  return {
    goal,
    scope,
    acceptance,
    ...(outOfScope ? { outOfScope } : {}),
    ...(contextRefs.length > 0 ? { contextRefs } : {}),
  }
}

export const resolveWorkerPromptFromDraft = (
  draft: ManagerTaskDraft,
): string | undefined => {
  const contract = buildTaskContractFromDraft(draft)
  if (!contract) return undefined
  const extraInstructions = normalizeList(draft.instructions)
  const base = buildGeneratedWorkerPrompt({
    title: normalizeLine(draft.title),
    goal: contract.goal,
    inScope: contract.scope,
    doneWhen: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: contract.contextRefs } : {}),
  })
  if (extraInstructions.length === 0) return base
  return `${base}\n\n补充说明：\n${extraInstructions
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')}`
}
