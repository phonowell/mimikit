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
    dialog_action_source_input_missing: z.string().trim().min(1),
    dialog_action_source_quote_missing: z.string().trim().min(1),
    dialog_action_source_quote_unanchored: z.string().trim().min(1),
    record_task_git_source_quote_action_missing: z.string().trim().min(1),
    record_task_git_required_actions: z
      .object({
        review_passed: z.string().trim().min(1),
        merged: z.string().trim().min(1),
        cleaned: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict()

type ActionEvidenceTemplates = z.infer<typeof actionEvidenceHintSchema>
type ActionEvidenceHintKey = Exclude<
  keyof ActionEvidenceTemplates,
  'record_task_git_required_actions'
>

const {
  path: evidenceHintTemplatePath,
  templates,
}: { path: string; templates: ActionEvidenceTemplates } =
  loadYamlPromptTemplates({
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

export const formatDialogActionSourceInputMissingHint = (
  actionName:
    | 'remember_memory'
    | 'remember_project_profile'
    | 'record_task_git',
): string =>
  renderHint('dialog_action_source_input_missing', {
    action_name: actionName,
  })

export const formatDialogActionSourceQuoteMissingHint = (
  actionName:
    | 'remember_memory'
    | 'remember_project_profile'
    | 'record_task_git',
): string =>
  renderHint('dialog_action_source_quote_missing', {
    action_name: actionName,
  })

export const formatDialogActionSourceQuoteUnanchoredHint = (
  actionName:
    | 'remember_memory'
    | 'remember_project_profile'
    | 'record_task_git',
): string =>
  renderHint('dialog_action_source_quote_unanchored', {
    action_name: actionName,
  })

export type RecordTaskGitState = 'review_passed' | 'merged' | 'cleaned'

const RECORD_TASK_GIT_REQUIRED_ACTIONS =
  templates.record_task_git_required_actions

export const resolveRecordTaskGitRequiredActionLabel = (
  state: RecordTaskGitState,
): string => RECORD_TASK_GIT_REQUIRED_ACTIONS[state]

export const formatRecordTaskGitSourceQuoteActionMissingHint = (
  state: RecordTaskGitState,
): string =>
  renderHint('record_task_git_source_quote_action_missing', {
    required_action: resolveRecordTaskGitRequiredActionLabel(state),
  })
