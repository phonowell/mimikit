import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { renderPromptTemplate } from '../prompts/format.js'
import { resolvePromptPath } from '../prompts/prompt-loader.js'

const HINT_TEMPLATE_RELATIVE_PATH = 'manager/action-feedback-hints.md'
const HINT_TEMPLATE_PATH = resolvePromptPath(HINT_TEMPLATE_RELATIVE_PATH)

const actionFeedbackHintSchema = z
  .object({
    unregistered_action: z.string().trim().min(1),
    invalid_action_syntax: z.string().trim().min(1),
    action_in_code_block: z.string().trim().min(1),
    invalid_action_args_empty: z.string().trim().min(1),
    invalid_action_args_with_issues: z.string().trim().min(1),
    invalid_iso_range_field: z.string().trim().min(1),
    scheduled_at_invalid: z.string().trim().min(1),
    scheduled_at_not_future: z.string().trim().min(1),
    cancel_task_not_found: z.string().trim().min(1),
    cancel_task_already_canceled: z.string().trim().min(1),
    cancel_task_not_cancelable: z.string().trim().min(1),
    compress_context_unavailable: z.string().trim().min(1),
    ask_user_choice_qq_unsupported: z.string().trim().min(1),
    ask_user_choice_invalid_options: z.string().trim().min(1),
    plan_not_found: z.string().trim().min(1),
    update_plan_done_forbidden: z.string().trim().min(1),
  })
  .strict()

type ActionFeedbackHintKey = keyof z.infer<typeof actionFeedbackHintSchema>

const loadHintTemplates = (): z.infer<typeof actionFeedbackHintSchema> => {
  const source = readFileSync(HINT_TEMPLATE_PATH, 'utf8').trim()
  if (!source)
    throw new Error(`missing_prompt_template:${HINT_TEMPLATE_RELATIVE_PATH}`)
  const parsed = actionFeedbackHintSchema.safeParse(parseYaml(source))
  if (!parsed.success)
    throw new Error(`invalid_prompt_template:${HINT_TEMPLATE_RELATIVE_PATH}`)
  return parsed.data
}

const templates = loadHintTemplates()

const renderHint = (
  key: ActionFeedbackHintKey,
  values?: Record<string, string>,
): string =>
  renderPromptTemplate(
    templates[key],
    values ?? {},
    `${HINT_TEMPLATE_PATH}#${key}`,
  ).trim()

export const formatUnregisteredActionHint = (
  registeredActions: string[],
): string =>
  renderHint('unregistered_action', {
    registered_actions: registeredActions.join(', '),
  })

export const formatInvalidActionSyntaxHint = (): string =>
  renderHint('invalid_action_syntax')

export const formatActionInCodeBlockHint = (): string =>
  renderHint('action_in_code_block')

export const formatInvalidActionArgsEmptyHint = (): string =>
  renderHint('invalid_action_args_empty')

export const formatInvalidActionArgsWithIssuesHint = (issues: string): string =>
  renderHint('invalid_action_args_with_issues', { issues })

export const formatInvalidIsoRangeFieldHint = (field: 'from' | 'to'): string =>
  renderHint('invalid_iso_range_field', { field })

export const formatScheduledAtInvalidHint = (
  action: 'create_plan' | 'update_plan',
): string => renderHint('scheduled_at_invalid', { action })

export const formatScheduledAtNotFutureHint = (
  action: 'create_plan' | 'update_plan',
  nowIso: string,
): string =>
  renderHint('scheduled_at_not_future', {
    action,
    now_iso: nowIso,
  })

export const formatCancelTaskNotFoundHint = (): string =>
  renderHint('cancel_task_not_found')

export const formatCancelTaskAlreadyCanceledHint = (): string =>
  renderHint('cancel_task_already_canceled')

export const formatCancelTaskNotCancelableHint = (): string =>
  renderHint('cancel_task_not_cancelable')

export const formatCompressContextUnavailableHint = (): string =>
  renderHint('compress_context_unavailable')

export const formatAskUserChoiceQqUnsupportedHint = (): string =>
  renderHint('ask_user_choice_qq_unsupported')

export const formatAskUserChoiceInvalidOptionsHint = (): string =>
  renderHint('ask_user_choice_invalid_options')

export const formatPlanNotFoundHint = (
  action: 'update_plan' | 'delete_plan',
): string => renderHint('plan_not_found', { action })

export const formatUpdatePlanDoneForbiddenHint = (): string =>
  renderHint('update_plan_done_forbidden')
