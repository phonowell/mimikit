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
        task_control: actionPromptSpecSchema,
        set_plan: actionPromptSpecSchema,
        delete_plan: actionPromptSpecSchema,
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
  },
})

const normalizePromptSpec = (
  item: z.infer<typeof actionPromptSpecSchema>,
): ManagerActionPromptSpec => ({
  summary: item.summary,
  ...(item.brief_constraints
    ? { briefConstraints: item.brief_constraints }
    : {}),
})

export const ACTION_PROMPT_SPECS = {
  enqueue_task: normalizePromptSpec(templates.actions.enqueue_task),
  task_control: normalizePromptSpec(templates.actions.task_control),
  set_plan: normalizePromptSpec(templates.actions.set_plan),
  delete_plan: normalizePromptSpec(templates.actions.delete_plan),
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

export const renderActionSurfaceIntro = (): string =>
  renderTemplate('surface_intro')

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
