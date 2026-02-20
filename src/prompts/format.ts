import { resolve } from 'node:path'

import type { ManagerEnv } from '../types/index.js'

type PromptTemplateValues = Record<string, string>
type PromptEnvironmentParams = {
  env?: ManagerEnv
  workDir?: string
}

type ConditionalRenderStop = 'eof' | 'else' | 'endif'
type ConditionalRenderResult = {
  output: string
  cursor: number
  stop: ConditionalRenderStop
}

type ConditionalDirective =
  | { type: 'if'; key: string; start: number; end: number }
  | { type: 'else'; start: number; end: number }
  | { type: 'endif'; start: number; end: number }

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
const DIRECTIVE_RE = /\{#if\s+([a-zA-Z_][a-zA-Z0-9_]*)\}|\{#else\}|\{\/if\}/g

const hasTruthyTemplateValue = (
  values: PromptTemplateValues,
  key: string,
): boolean => {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return false
  return (values[key] ?? '').trim() !== ''
}

const findNextDirective = (
  template: string,
  cursor: number,
): ConditionalDirective | undefined => {
  DIRECTIVE_RE.lastIndex = cursor
  const match = DIRECTIVE_RE.exec(template)
  if (!match) return undefined
  const token = match[0]
  const start = match.index
  const end = start + token.length
  if (token === '{#else}') return { type: 'else', start, end }
  if (token === '{/if}') return { type: 'endif', start, end }
  const key = match[1]
  if (!key) throw new Error('prompt_template_if_key_missing')
  return { type: 'if', key, start, end }
}

const renderConditionalSection = (
  template: string,
  values: PromptTemplateValues,
  start: number,
  inIfBlock: boolean,
): ConditionalRenderResult => {
  let cursor = start
  let output = ''
  while (cursor < template.length) {
    const directive = findNextDirective(template, cursor)
    if (!directive) {
      output += template.slice(cursor)
      return { output, cursor: template.length, stop: 'eof' }
    }
    output += template.slice(cursor, directive.start)
    cursor = directive.end
    if (directive.type === 'if') {
      const truthy = hasTruthyTemplateValue(values, directive.key)
      const truthyBranch = renderConditionalSection(
        template,
        values,
        cursor,
        true,
      )
      if (truthyBranch.stop === 'eof')
        throw new Error('prompt_template_if_missing_end')
      if (truthyBranch.stop === 'endif') {
        if (truthy) output += truthyBranch.output
        cursor = truthyBranch.cursor
        continue
      }
      const falsyBranch = renderConditionalSection(
        template,
        values,
        truthyBranch.cursor,
        true,
      )
      if (falsyBranch.stop !== 'endif')
        throw new Error('prompt_template_if_missing_end')
      output += truthy ? truthyBranch.output : falsyBranch.output
      cursor = falsyBranch.cursor
      continue
    }
    if (directive.type === 'else') {
      if (!inIfBlock) throw new Error('prompt_template_else_unexpected')
      return { output, cursor, stop: 'else' }
    }
    if (!inIfBlock) throw new Error('prompt_template_endif_unexpected')
    return { output, cursor, stop: 'endif' }
  }
  return { output, cursor, stop: 'eof' }
}

const renderConditionalBlocks = (
  template: string,
  values: PromptTemplateValues,
): string => {
  const rendered = renderConditionalSection(template, values, 0, false)
  if (rendered.stop !== 'eof')
    throw new Error('prompt_template_conditional_unexpected_stop')
  return rendered.output
}

export const renderPromptTemplate = (
  template: string,
  values: PromptTemplateValues,
): string =>
  renderConditionalBlocks(template, values).replace(
    PLACEHOLDER_RE,
    (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return match
      return values[key] ?? match
    },
  )

export const formatEnvironment = (params?: PromptEnvironmentParams): string => {
  const lines: string[] = []
  const push = (label: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    lines.push(`- ${label}: ${value}`)
  }
  const workDir = params?.workDir?.trim()
  push('work_dir', workDir ? resolve(workDir) : undefined)
  const last = params?.env?.lastUser
  if (last) {
    push('client_time_zone', last.clientTimeZone)
    push('client_now_iso', last.clientNowIso)
  }
  if (lines.length === 0) return ''
  return lines.join('\n')
}

export {
  formatActionFeedback,
  formatHistoryLookup,
  formatInputs,
} from './format-messages.js'
export { formatResultsYaml, formatTasksYaml } from './format-content.js'
