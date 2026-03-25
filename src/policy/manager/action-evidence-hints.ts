import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'

const EVIDENCE_HINT_TEMPLATE_RELATIVE_PATH = 'manager/action-evidence-hints.md'

const actionEvidenceHintSchema = z
  .object({
    enqueue_task_intent_evidence_missing: z.string().trim().min(1),
    mutate_task_intent_evidence_missing: z.string().trim().min(1),
    restart_runtime_intent_evidence_missing: z.string().trim().min(1),
    ask_user_choice_intent_evidence_missing: z.string().trim().min(1),
    remember_memory_intent_evidence_missing: z.string().trim().min(1),
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

export const formatMutateTaskIntentEvidenceHint = (params: {
  evidenceSources: string
  taskRef: string
  requiredAction?: string
}): string =>
  renderHint('mutate_task_intent_evidence_missing', {
    evidence_sources: params.evidenceSources,
    task_ref: params.taskRef,
    required_action: params.requiredAction ?? '目标控制动作',
  })

export const formatRestartRuntimeIntentEvidenceHint = (
  evidenceSources: string,
): string =>
  renderHint('restart_runtime_intent_evidence_missing', {
    evidence_sources: evidenceSources,
  })

export const formatAskUserChoiceIntentEvidenceHint = (
  evidenceSources: string,
): string =>
  renderHint('ask_user_choice_intent_evidence_missing', {
    evidence_sources: evidenceSources,
  })

export const formatRememberMemoryIntentEvidenceHint = (
  evidenceSources: string,
): string =>
  renderHint('remember_memory_intent_evidence_missing', {
    evidence_sources: evidenceSources,
  })
