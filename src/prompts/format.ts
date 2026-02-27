import { resolve } from 'node:path'
import { Environment, FileSystemLoader, Template } from 'nunjucks'

import type { ManagerEnv } from '../types/index.js'
import { PROMPTS_ROOT } from './prompt-loader.js'

type PromptTemplateValues = Record<string, string>
type PromptEnvironmentParams = {
  env?: ManagerEnv
  workDir?: string
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

const padNum = (value: number, width = 2): string =>
  String(value).padStart(width, '0')

const toUtcOffsetText = (clientOffsetMinutes: number): string => {
  const offsetMinutes = -Math.trunc(clientOffsetMinutes)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  return `${sign}${padNum(hours)}:${padNum(minutes)}`
}

const toClientNowLocalIso = (
  clientNowIso: string,
  clientOffsetMinutes: number,
): string | undefined => {
  const utcMs = Date.parse(clientNowIso)
  if (!Number.isFinite(utcMs)) return undefined
  const localMs = utcMs - Math.trunc(clientOffsetMinutes) * 60_000
  const localDate = new Date(localMs)
  const utcOffset = toUtcOffsetText(clientOffsetMinutes)
  return `${localDate.getUTCFullYear()}-${padNum(
    localDate.getUTCMonth() + 1,
  )}-${padNum(localDate.getUTCDate())}T${padNum(
    localDate.getUTCHours(),
  )}:${padNum(localDate.getUTCMinutes())}:${padNum(
    localDate.getUTCSeconds(),
  )}.${padNum(localDate.getUTCMilliseconds(), 3)}${utcOffset}`
}
export const formatEnvironment = (params?: PromptEnvironmentParams): string => {
  const lines: string[] = []
  const push = (label: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    lines.push(`- ${label}: ${value}`)
  }
  const workDir = params?.workDir?.trim()
  push('work_dir', workDir ? resolve(workDir) : undefined)
  push('wake_profile', params?.env?.wakeProfile)
  const last = params?.env?.lastUser
  if (last) {
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
  formatActionFeedback,
  formatHistoryLookup,
  formatInputs,
  formatRecentHistory,
} from './format-messages.js'
export { formatFocusContexts, formatFocusList } from './format-focus.js'
export {
  formatIntentsYaml,
  formatResultsYaml,
  formatTasksYaml,
} from './format-content.js'
