import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'

const EVIDENCE_HINT_TEMPLATE_RELATIVE_PATH = 'manager/action-evidence-hints.md'

const actionEvidenceHintSchema = z
  .object({
    enqueue_task_intent_evidence_missing: z.string().trim().min(1),
    task_control_intent_evidence_missing: z.string().trim().min(1),
    record_task_git_intent_evidence_missing: z.string().trim().min(1),
    set_plan_intent_evidence_missing: z.string().trim().min(1),
  })
  .strict()

type ActionEvidenceHintKey = keyof z.infer<typeof actionEvidenceHintSchema>

const { path: evidenceHintTemplatePath, templates } = loadYamlPromptTemplates({
  relativePath: EVIDENCE_HINT_TEMPLATE_RELATIVE_PATH,
  schema: actionEvidenceHintSchema,
})

const renderHint = createPromptTemplateRenderer<ActionEvidenceHintKey>({
  path: evidenceHintTemplatePath,
  templates,
})

export const formatEnqueueTaskIntentEvidenceHint = (
  evidenceSources: string,
): string =>
  renderHint('enqueue_task_intent_evidence_missing', {
    evidence_sources: evidenceSources,
  })

export const formatTaskControlIntentEvidenceHint = (params: {
  evidenceSources: string
  taskRef: string
  requiredAction?: string
}): string =>
  renderHint('task_control_intent_evidence_missing', {
    evidence_sources: params.evidenceSources,
    task_ref: params.taskRef,
    required_action: params.requiredAction ?? '目标控制动作',
  })

export const formatRecordTaskGitIntentEvidenceHint = (params: {
  evidenceSources: string
  taskRef: string
  requiredAction?: string
}): string =>
  renderHint('record_task_git_intent_evidence_missing', {
    evidence_sources: params.evidenceSources,
    task_ref: params.taskRef,
    required_action: params.requiredAction ?? '目标 git 状态写回动作',
  })

export const formatSetPlanIntentEvidenceHint = (
  evidenceSources: string,
): string =>
  renderHint('set_plan_intent_evidence_missing', {
    evidence_sources: evidenceSources,
  })
