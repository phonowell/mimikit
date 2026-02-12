import { normalizeTagName } from './format-base.js'

import type { ManagerEnv } from '../types/index.js'

type PromptTemplateValues = Record<string, string>

export const renderPromptTemplate = (
  template: string,
  values: PromptTemplateValues,
): string =>
  template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match
    return values[key] ?? match
  })

export const joinPromptSections = (sections: string[]): string => {
  let output = ''
  for (const section of sections) {
    if (!section) continue
    output = output ? `${output}\n\n${section}` : section
  }
  return output
}

export const formatEnvironment = (env?: ManagerEnv): string => {
  const now = new Date()
  const lines: string[] = []
  const push = (label: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    lines.push(`- ${label}: ${value}`)
  }
  push('now_iso', now.toISOString())
  const last = env?.lastUser
  if (last) {
    push('client_time_zone', last.clientTimeZone)
    push('client_now_iso', last.clientNowIso)
  }
  if (lines.length === 0) return ''
  return lines.join('\n')
}

export const buildCdataBlock = (
  tag: string,
  content: string,
  includeEmpty = false,
): string => {
  if (!content && !includeEmpty) return ''
  const normalized = normalizeTagName(tag)
  return `<${normalized}>\n<![CDATA[\n${content}\n]]>\n</${normalized}>`
}

export const buildRawBlock = (
  tag: string,
  content: string,
  includeEmpty = false,
): string => {
  if (!content && !includeEmpty) return ''
  const normalized = normalizeTagName(tag)
  const escaped = content.replaceAll(`</${normalized}>`, `<\\/${normalized}>`)
  return `<${normalized}>\n${escaped}\n</${normalized}>`
}

export const formatMarkdownReference = (content: string): string => {
  const trimmed = content.trim()
  if (!trimmed) return ''
  return trimmed
}

export {
  formatDecesionsYaml,
  formatHistory,
  formatInputs,
  formatResultsYaml,
  formatTasksYaml,
  selectTasksForPrompt,
} from './format-content.js'
