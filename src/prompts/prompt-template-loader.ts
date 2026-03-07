import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'

import { renderPromptTemplate } from './format.js'
import { resolvePromptPath } from './prompt-loader.js'

import type { z } from 'zod'

export const loadYamlPromptTemplates = <Schema extends z.ZodTypeAny>(params: {
  relativePath: string
  schema: Schema
}): { path: string; templates: z.infer<Schema> } => {
  const path = resolvePromptPath(params.relativePath)
  const source = readFileSync(path, 'utf8').trim()
  if (!source) throw new Error(`missing_prompt_template:${params.relativePath}`)
  const parsed = params.schema.safeParse(parseYaml(source))
  if (!parsed.success)
    throw new Error(`invalid_prompt_template:${params.relativePath}`)
  return {
    path,
    templates: parsed.data,
  }
}

export const createPromptTemplateRenderer = <K extends string>(params: {
  path: string
  templates: Record<K, string>
}) => {
  const { path, templates } = params
  return (key: K, values?: Record<string, string>): string =>
    renderPromptTemplate(templates[key], values ?? {}, `${path}#${key}`).trim()
}
