import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { clipUtf8ByBytes, truncateText } from '../shared/text.js'

import {
  formatWorkerTaskPromptExternalizedIntro,
  formatWorkerTaskPromptExternalizedPathLine,
  formatWorkerTaskPromptExternalizedPreviewHeader,
  formatWorkerTaskPromptTruncatedNote,
} from './worker-task-prompt-hints.js'

export const WORKER_TASK_PROMPT_MAX_BYTES = 8_192
export const WORKER_TASK_PROMPT_INLINE_MAX_BYTES = 256
export const WORKER_TASK_PROMPT_PREVIEW_MAX_CHARS = 150

const WORKER_SECTION_PROMPT_RE = /<M:prompt>\s*([\s\S]*?)\s*<\/M:prompt>/i
const WORKER_SECTION_ENVIRONMENT_TEST_RE =
  /<M:environment>[\s\S]*?<\/M:environment>/i
const WORKER_SECTION_ENVIRONMENT_GLOBAL_RE =
  /<M:environment>[\s\S]*?<\/M:environment>/gi
const WORKER_BLANK_LINE_RUN_RE = /\n{3,}/g
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const WORKER_PROMPT_TRUNCATED_NOTE = formatWorkerTaskPromptTruncatedNote()
const WORKER_PROMPT_EXTERNALIZED_INTRO =
  formatWorkerTaskPromptExternalizedIntro()
const WORKER_PROMPT_EXTERNALIZED_PREVIEW_HEADER =
  formatWorkerTaskPromptExternalizedPreviewHeader()

const withWorkerPromptBudget = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return normalized
  const normalizedBytes = Buffer.byteLength(normalized, 'utf8')
  if (normalizedBytes <= WORKER_TASK_PROMPT_MAX_BYTES) return normalized
  const reserve = Buffer.byteLength(WORKER_PROMPT_TRUNCATED_NOTE, 'utf8') + 2
  const budget = Math.max(0, WORKER_TASK_PROMPT_MAX_BYTES - reserve)
  const clipped = clipUtf8ByBytes(normalized, budget)
  if (!clipped) return WORKER_PROMPT_TRUNCATED_NOTE
  return `${clipped}\n\n${WORKER_PROMPT_TRUNCATED_NOTE}`
}

const extractWrappedTaskPrompt = (value: string): string | undefined => {
  if (!WORKER_SECTION_ENVIRONMENT_TEST_RE.test(value)) return undefined
  const match = WORKER_SECTION_PROMPT_RE.exec(value)
  if (!match?.[1]) return undefined
  const extracted = match[1].trim()
  if (!extracted) return undefined
  return extracted
}

export const normalizeWorkerTaskPrompt = (prompt: string): string => {
  const extracted = extractWrappedTaskPrompt(prompt)
  const source = extracted ?? prompt
  return source
    .replace(WORKER_SECTION_ENVIRONMENT_GLOBAL_RE, '')
    .replace(WORKER_BLANK_LINE_RUN_RE, '\n\n')
    .trim()
}

const resolveDateDir = (iso: string): string | undefined => {
  const date = iso.slice(0, 10)
  return ISO_DATE_RE.test(date) ? date : undefined
}

const taskPromptFilePath = (
  workDir: string,
  taskId: string,
  taskCreatedAt: string,
): string => {
  const dateDir = resolveDateDir(taskCreatedAt)
  return resolve(
    workDir,
    'generated',
    'worker-task-prompts',
    ...(dateDir ? [dateDir] : []),
    `${taskId}.md`,
  )
}

const toTaskPromptPreview = (value: string): string => {
  const compact = value.replace(/\s+/g, ' ').trim()
  return truncateText(compact, WORKER_TASK_PROMPT_PREVIEW_MAX_CHARS, {
    suffix: '...',
  })
}

const externalizeWorkerTaskPromptIfNeeded = async (params: {
  workDir: string
  taskId: string
  taskCreatedAt: string
  taskPrompt: string
}): Promise<string> => {
  const bytes = Buffer.byteLength(params.taskPrompt, 'utf8')
  if (bytes <= WORKER_TASK_PROMPT_INLINE_MAX_BYTES)
    return withWorkerPromptBudget(params.taskPrompt)
  const path = taskPromptFilePath(
    params.workDir,
    params.taskId,
    params.taskCreatedAt,
  )
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, params.taskPrompt, 'utf8')
  const preview = toTaskPromptPreview(params.taskPrompt)
  return [
    WORKER_PROMPT_EXTERNALIZED_INTRO,
    formatWorkerTaskPromptExternalizedPathLine(path),
    WORKER_PROMPT_EXTERNALIZED_PREVIEW_HEADER,
    preview,
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

export const prepareWorkerTaskPrompt = (params: {
  workDir: string
  taskId: string
  taskCreatedAt: string
  taskPrompt: string
}): Promise<string> => {
  const normalized = normalizeWorkerTaskPrompt(params.taskPrompt)
  return externalizeWorkerTaskPromptIfNeeded({
    workDir: params.workDir,
    taskId: params.taskId,
    taskCreatedAt: params.taskCreatedAt,
    taskPrompt: normalized,
  })
}
