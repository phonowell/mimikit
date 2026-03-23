import { resolve } from 'node:path'

import { Environment, FileSystemLoader, Template } from 'nunjucks'

import { toClientNowLocalIso, toUtcOffsetText } from '../shared/time.js'

import { PROMPTS_ROOT } from './prompt-loader.js'

import type { ManagerEnv } from '../types/index.js'

type PromptTemplateValues = Record<string, string>
type PromptEnvironmentParams = {
  env?: ManagerEnv
  stateDir?: string
  workDir?: string
  generatedDir?: string
}

const PROMPT_TEMPLATE_ENV = new Environment(
  new FileSystemLoader(PROMPTS_ROOT, { noCache: true }),
  {
    autoescape: false,
    noCache: true,
    throwOnUndefined: false,
  },
)

export const renderPromptTemplate = (
  template: string,
  values: PromptTemplateValues,
  templatePath?: string,
): string =>
  new Template(template, PROMPT_TEMPLATE_ENV, templatePath).render(values)

export const formatEnvironment = (params?: PromptEnvironmentParams): string => {
  const lines: string[] = []
  const push = (label: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    lines.push(`- ${label}: ${value}`)
  }
  const stateDir = params?.stateDir?.trim()
  const resolvedStateDir = stateDir ? resolve(stateDir) : undefined
  const workDir = params?.workDir?.trim()
  const resolvedWorkDir = workDir ? resolve(workDir) : undefined
  const generatedDir = params?.generatedDir?.trim()
  const resolvedGeneratedDir = generatedDir
    ? resolve(generatedDir)
    : resolvedStateDir
      ? resolve(resolvedStateDir, 'generated')
      : resolvedWorkDir
        ? resolve(resolvedWorkDir, 'generated')
        : undefined
  push('state_dir', resolvedStateDir)
  push('work_dir', resolvedWorkDir)
  push('generated_dir', resolvedGeneratedDir)
  push('wake_profile', params?.env?.wakeProfile)
  const slots = params?.env?.workerSlots
  if (slots) {
    push('max_slots', slots.maxSlots)
    push('occupied_slots', slots.occupiedSlots)
    push('available_slots', slots.availableSlots)
  }
  const last = params?.env?.lastUser
  if (last) {
    push('last_user_source', last.source)
    push('last_user_platform', last.platform)
    push('client_locale', last.clientLocale)
    push('client_time_zone', last.clientTimeZone)
    push('client_offset_minutes', last.clientOffsetMinutes)
    if (last.clientOffsetMinutes !== undefined)
      push('client_utc_offset', toUtcOffsetText(last.clientOffsetMinutes))
    push('client_now_iso', last.clientNowIso)
    if (
      last.clientNowIso &&
      last.clientOffsetMinutes !== undefined &&
      Number.isFinite(last.clientOffsetMinutes)
    ) {
      push(
        'client_now_local_iso',
        toClientNowLocalIso(last.clientNowIso, last.clientOffsetMinutes),
      )
    }
  }
  push('server_time_zone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  push('server_now_iso', new Date().toISOString())
  if (lines.length === 0) return ''
  return lines.join('\n')
}

export {
  buildActionFeedbackPromptPayload,
  formatActionFeedback,
} from './format-action-feedback.js'
export {
  buildInputsPromptPayload,
  buildRecentHistoryPromptPayload,
  formatInputs,
  formatRecentHistory,
} from './format-message-dialog.js'
export {
  buildQuoteReferenceLookup,
  type PromptQuoteReference,
  type PromptQuoteReferenceLookup,
} from './format-message-quote.js'
export {
  buildFocusListPromptPayload,
  formatFocusList,
  buildWorkingFocusesPromptPayload,
  formatWorkingFocuses,
} from './format-focus.js'
export {
  buildResultsPromptPayload,
  buildTasksPromptPayload,
  formatResultsJson,
  formatTasksJson,
  selectTasksForPrompt,
} from './format-task-content.js'
export {
  buildPlansPromptPayload,
  formatPlansJson,
} from './format-plan-content.js'
