import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from './prompt-template-loader.js'

const HINT_TEMPLATE_RELATIVE_PATH = 'worker/task-prompt-hints.md'

const workerTaskPromptHintSchema = z
  .object({
    truncated_note: z.string().trim().min(1),
    externalized_intro: z.string().trim().min(1),
    externalized_path_line: z.string().trim().min(1),
    externalized_preview_header: z.string().trim().min(1),
  })
  .strict()

type WorkerTaskPromptHintKey = keyof z.infer<typeof workerTaskPromptHintSchema>

const { path: hintTemplatePath, templates } = loadYamlPromptTemplates({
  relativePath: HINT_TEMPLATE_RELATIVE_PATH,
  schema: workerTaskPromptHintSchema,
})
const renderTemplate = createPromptTemplateRenderer<WorkerTaskPromptHintKey>({
  path: hintTemplatePath,
  templates,
})

const renderHint = (
  key: WorkerTaskPromptHintKey,
  values?: Record<string, string>,
): string => renderTemplate(key, values)

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
