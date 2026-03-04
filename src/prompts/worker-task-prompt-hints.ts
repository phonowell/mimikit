import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { renderPromptTemplate } from './format.js'
import { resolvePromptPath } from './prompt-loader.js'

const HINT_TEMPLATE_RELATIVE_PATH = 'worker/task-prompt-hints.md'
const HINT_TEMPLATE_PATH = resolvePromptPath(HINT_TEMPLATE_RELATIVE_PATH)

const workerTaskPromptHintSchema = z
  .object({
    truncated_note: z.string().trim().min(1),
    externalized_intro: z.string().trim().min(1),
    externalized_path_line: z.string().trim().min(1),
    externalized_preview_header: z.string().trim().min(1),
  })
  .strict()

type WorkerTaskPromptHintKey = keyof z.infer<typeof workerTaskPromptHintSchema>

const loadHintTemplates = (): z.infer<typeof workerTaskPromptHintSchema> => {
  const source = readFileSync(HINT_TEMPLATE_PATH, 'utf8').trim()
  if (!source)
    throw new Error(`missing_prompt_template:${HINT_TEMPLATE_RELATIVE_PATH}`)
  const parsed = workerTaskPromptHintSchema.safeParse(parseYaml(source))
  if (!parsed.success)
    throw new Error(`invalid_prompt_template:${HINT_TEMPLATE_RELATIVE_PATH}`)
  return parsed.data
}

const templates = loadHintTemplates()

const renderHint = (
  key: WorkerTaskPromptHintKey,
  values?: Record<string, string>,
): string =>
  renderPromptTemplate(
    templates[key],
    values ?? {},
    `${HINT_TEMPLATE_PATH}#${key}`,
  ).trim()

export const formatWorkerTaskPromptTruncatedNote = (): string =>
  renderHint('truncated_note')

export const formatWorkerTaskPromptExternalizedIntro = (): string =>
  renderHint('externalized_intro')

export const formatWorkerTaskPromptExternalizedPathLine = (
  fullPromptPath: string,
): string =>
  renderHint('externalized_path_line', {
    full_prompt_path: fullPromptPath,
  })

export const formatWorkerTaskPromptExternalizedPreviewHeader = (): string =>
  renderHint('externalized_preview_header')
