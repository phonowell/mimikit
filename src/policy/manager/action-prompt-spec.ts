import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'

import type {
  ManagerActionDomain,
  ManagerActionPromptSpec,
} from './action-registry-shared.js'

const actionPromptSpecSchema = z
  .object({
    summary: z.string().trim().min(1),
    brief_constraints: z.array(z.string().trim().min(1)).optional(),
    detail_constraints: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

const domainSpecSchema = z
  .object({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })
  .strict()

const actionSurfaceTemplateSchema = z
  .object({
    surface_intro: z.string().trim().min(1),
    domain_heading: z.string().trim().min(1),
    domain_boundary: z.string().trim().min(1),
    action_summary: z.string().trim().min(1),
    action_detail: z.string().trim().min(1),
    detail_heading: z.string().trim().min(1),
    detail_all: z.string().trim().min(1),
    detail_feedback: z.string().trim().min(1),
    domains: z
      .object({
        task: domainSpecSchema,
        plan: domainSpecSchema,
        dialog: domainSpecSchema,
        focus: domainSpecSchema,
        memory: domainSpecSchema,
      })
      .strict(),
    actions: z
      .object({
        enqueue_task: actionPromptSpecSchema,
        mutate_task: actionPromptSpecSchema,
        restart_runtime: actionPromptSpecSchema,
        set_task_result_summary: actionPromptSpecSchema,
        create_plan: actionPromptSpecSchema,
        update_plan: actionPromptSpecSchema,
        delete_plan: actionPromptSpecSchema,
        ask_user_choice: actionPromptSpecSchema,
        upsert_focus: actionPromptSpecSchema,
        assign_focus: actionPromptSpecSchema,
        remember_memory: actionPromptSpecSchema,
      })
      .strict(),
  })
  .strict()

const ACTION_SURFACE_TEMPLATE_PATH = 'manager/action-surface.md'

const { path, templates } = loadYamlPromptTemplates({
  relativePath: ACTION_SURFACE_TEMPLATE_PATH,
  schema: actionSurfaceTemplateSchema,
})

const renderTemplate = createPromptTemplateRenderer({
  path,
  templates: {
    surface_intro: templates.surface_intro,
    domain_heading: templates.domain_heading,
    domain_boundary: templates.domain_boundary,
    action_summary: templates.action_summary,
    action_detail: templates.action_detail,
    detail_heading: templates.detail_heading,
    detail_all: templates.detail_all,
    detail_feedback: templates.detail_feedback,
  },
})

const normalizePromptSpec = (
  item: z.infer<typeof actionPromptSpecSchema>,
): ManagerActionPromptSpec => ({
  summary: item.summary,
  ...(item.brief_constraints
    ? { briefConstraints: item.brief_constraints }
    : {}),
  ...(item.detail_constraints
    ? { detailConstraints: item.detail_constraints }
    : {}),
})

export const ACTION_PROMPT_SPECS = {
  enqueue_task: normalizePromptSpec(templates.actions.enqueue_task),
  mutate_task: normalizePromptSpec(templates.actions.mutate_task),
  restart_runtime: normalizePromptSpec(templates.actions.restart_runtime),
  set_task_result_summary: normalizePromptSpec(
    templates.actions.set_task_result_summary,
  ),
  create_plan: normalizePromptSpec(templates.actions.create_plan),
  update_plan: normalizePromptSpec(templates.actions.update_plan),
  delete_plan: normalizePromptSpec(templates.actions.delete_plan),
  ask_user_choice: normalizePromptSpec(templates.actions.ask_user_choice),
  upsert_focus: normalizePromptSpec(templates.actions.upsert_focus),
  assign_focus: normalizePromptSpec(templates.actions.assign_focus),
  remember_memory: normalizePromptSpec(templates.actions.remember_memory),
} as const

export const ACTION_DOMAIN_SPECS: Record<
  ManagerActionDomain,
  { domain: ManagerActionDomain; title: string; summary: string }
> = {
  task: {
    domain: 'task',
    ...templates.domains.task,
  },
  plan: {
    domain: 'plan',
    ...templates.domains.plan,
  },
  dialog: {
    domain: 'dialog',
    ...templates.domains.dialog,
  },
  focus: {
    domain: 'focus',
    ...templates.domains.focus,
  },
  memory: {
    domain: 'memory',
    ...templates.domains.memory,
  },
}

const buildConstraintsSuffix = (constraints?: readonly string[]): string =>
  constraints && constraints.length > 0 ? `；${constraints.join('；')}` : ''

export const renderActionSurfaceIntro = (wakeProfile: string): string =>
  renderTemplate('surface_intro', { wake_profile: wakeProfile })

export const renderActionDomainHeading = (title: string): string =>
  renderTemplate('domain_heading', { title })

export const renderActionDomainBoundary = (summary: string): string =>
  renderTemplate('domain_boundary', { summary })

export const renderActionSummaryLine = (params: {
  name: string
  prompt: ManagerActionPromptSpec
}): string =>
  renderTemplate('action_summary', {
    name: params.name,
    summary: params.prompt.summary.replace(/[。.]$/, ''),
    constraints_suffix: buildConstraintsSuffix(params.prompt.briefConstraints),
  })

export const renderActionDetailLine = (params: {
  name: string
  prompt: ManagerActionPromptSpec
}): string =>
  renderTemplate('action_detail', {
    name: params.name,
    summary: params.prompt.summary.replace(/[。.]$/, ''),
    constraints_suffix: buildConstraintsSuffix([
      ...(params.prompt.briefConstraints ?? []),
      ...(params.prompt.detailConstraints ?? []),
    ]),
  })

export const renderActionDetailHeading = (): string =>
  renderTemplate('detail_heading')

export const renderActionDetailAll = (): string => renderTemplate('detail_all')

export const renderActionDetailFeedback = (actionNames: string[]): string =>
  renderTemplate('detail_feedback', {
    action_names: actionNames.join(', '),
  })
