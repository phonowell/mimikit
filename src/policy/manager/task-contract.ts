import { resolve } from 'node:path'

import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'
import { canonicalizeTaskDraft } from '../../foundation/shared/task-draft-canonicalize.js'

import { formatEnqueueTaskContractMissingHint } from './action-feedback-hints.js'

import type { ManagerTaskDraft } from './manager-turn-schema.js'
import type { TaskContract } from '../../foundation/types/index.js'

export const TASK_CONTRACT_REQUIRED_HINT =
  formatEnqueueTaskContractMissingHint()

const taskContractWorkerPromptTemplateSchema = z
  .object({
    body: z.string().trim().min(1),
    title_label: z.string().trim().min(1),
    out_of_scope_label: z.string().trim().min(1),
    context_refs_label: z.string().trim().min(1),
    extra_instructions_heading: z.string().trim().min(1),
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

const STATE_RELATIVE_REF_PREFIXES = [
  'tasks/',
  'generated/',
  'traces/',
  'results/',
  'history/',
  'memory/',
  'usage/',
  'specs/',
  'runtime/',
] as const

const STATE_RELATIVE_REF_FILES = [
  'runtime-snapshot.json',
  'runtime-snapshot.json.bak',
  'log.jsonl',
] as const

const isStateRelativeContextRef = (value: string): boolean =>
  STATE_RELATIVE_REF_PREFIXES.some((prefix) => value.startsWith(prefix)) ||
  STATE_RELATIVE_REF_FILES.includes(
    value as (typeof STATE_RELATIVE_REF_FILES)[number],
  )

const normalizeContextRefs = (
  values: readonly string[],
  stateDir?: string,
): string[] => {
  const normalized = normalizeList(values)
  if (!stateDir) return normalized
  return normalized.map((value) =>
    isStateRelativeContextRef(value) ? resolve(stateDir, value) : value,
  )
}

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
  extraInstructions?: string[] | undefined
  stateDir?: string | undefined
}): string => {
  const title = params.title?.trim()
  const outOfScope = params.outOfScope?.trim()
  const contextRefs = normalizeContextRefs(
    params.contextRefs ?? [],
    params.stateDir,
  )
  const extraInstructions = normalizeList(params.extraInstructions ?? [])
  return renderTaskContractWorkerPrompt('body', {
    title: title ?? '',
    goal: params.goal,
    in_scope: params.inScope,
    title_label: taskContractWorkerPromptTemplates.title_label,
    out_of_scope: outOfScope ?? '',
    out_of_scope_label: taskContractWorkerPromptTemplates.out_of_scope_label,
    context_refs: contextRefs.join('；'),
    context_refs_label: taskContractWorkerPromptTemplates.context_refs_label,
    done_when_block: params.doneWhen
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n'),
    extra_instructions_heading:
      taskContractWorkerPromptTemplates.extra_instructions_heading,
    extra_instructions_block: extraInstructions
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n'),
  })
}

export const buildTaskContractFromDraft = (
  draft: ManagerTaskDraft,
): TaskContract | undefined => {
  const compactDraft = canonicalizeTaskDraft(draft)
  const goal = normalizeLine(compactDraft.goal)
  const scope = joinList(compactDraft.in_scope)
  if (!goal || !scope || compactDraft.done_when.length === 0) return undefined
  const outOfScope = joinList(compactDraft.out_of_scope)
  const contextRefs = normalizeList(compactDraft.context_refs)
  const acceptance = normalizeList(compactDraft.done_when)
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
  options?: {
    stateDir?: string
  },
): string | undefined => {
  const compactDraft = canonicalizeTaskDraft(draft)
  const contract = buildTaskContractFromDraft(compactDraft)
  if (!contract) return undefined
  return buildGeneratedWorkerPrompt({
    title: normalizeLine(compactDraft.title),
    goal: contract.goal,
    inScope: contract.scope,
    doneWhen: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: contract.contextRefs } : {}),
    extraInstructions: compactDraft.instructions,
    stateDir: options?.stateDir,
  })
}
