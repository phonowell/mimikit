import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ensureDir } from '../fs/paths.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { readHistory } from '../history/store.js'
import { bestEffort } from '../log/safe.js'
import {
  cancelTask,
  notifyWorkerLoop,
  persistRuntimeState,
  type RuntimeState,
} from './runtime-adapter.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'
import { readErrorCode } from '../shared/error-code.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'
import { newId, nowIso } from '../shared/utils.js'

import {
  cancelSchema,
  compressContextSchema,
  restartSchema,
  writePersonaSchema,
  writeUserProfileSchema,
} from './action-apply-schema.js'
import { runManagerLlmCall } from './manager-llm-call.js'

import type { Parsed } from '../actions/model/spec.js'

const MAX_COMPRESSED_CONTEXT_CHARS = 4_000
const MAX_HISTORY_ITEMS = 40
const MAX_HISTORY_LINE_CHARS = 220
const MAX_TASK_ITEMS = 20
const MAX_PROMPT_CHARS = 16_000

const normalizeProfileContent = (value: string): string =>
  value.replace(/\r\n/g, '\n')

const normalizeCompressedContext = (value: string): string => {
  const normalized = value.trim().replace(/\r\n/g, '\n')
  if (normalized.length <= MAX_COMPRESSED_CONTEXT_CHARS) return normalized
  return `${normalized.slice(0, MAX_COMPRESSED_CONTEXT_CHARS - 1).trimEnd()}…`
}

const normalizeInline = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const clip = (value: string, maxChars: number): string => {
  const normalized = normalizeInline(value)
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
}

const formatHistorySection = async (runtime: RuntimeState): Promise<string> => {
  const history = await readHistory(runtime.paths.history)
  const visible = history.filter((item) => isVisibleToAgent(item))
  const recent = visible.slice(Math.max(0, visible.length - MAX_HISTORY_ITEMS))
  if (recent.length === 0) return '无'
  return recent
    .map(
      (item, index) =>
        `${index + 1}. [${item.createdAt}] (${item.role}) ${clip(item.text, MAX_HISTORY_LINE_CHARS)}`,
    )
    .join('\n')
}

const formatTasksSection = (runtime: RuntimeState): string => {
  if (runtime.tasks.length === 0) return '无'
  return runtime.tasks
    .slice(Math.max(0, runtime.tasks.length - MAX_TASK_ITEMS))
    .map((task, index) => {
      const resultSummary = task.result?.output
        ? clip(task.result.output, 120)
        : ''
      return `${index + 1}. [${task.status}] id=${task.id} title=${clip(task.title, 80)}${resultSummary ? ` result=${resultSummary}` : ''}`
    })
    .join('\n')
}

const buildCompressPrompt = async (runtime: RuntimeState): Promise<string> => {
  const base = (await loadPromptFile('manager', 'compress-context')).trim()
  if (!base)
    throw new Error('missing_prompt_template:manager/compress-context.md')
  const historyText = await formatHistorySection(runtime)
  const tasksText = formatTasksSection(runtime)
  const existing = runtime.managerCompressedContext?.trim()
  const existingText = existing && existing.length > 0 ? existing : '无'
  const prompt = [
    base,
    '',
    '上下文材料（仅用于压缩，不要原样复述）：',
    '',
    '# ExistingCompressedContext',
    existingText,
    '',
    '# RecentHistory',
    historyText,
    '',
    '# TasksSnapshot',
    tasksText,
  ].join('\n')
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt
  return `${prompt.slice(0, MAX_PROMPT_CHARS - 1).trimEnd()}…`
}

const requestManagerRestart = (runtime: RuntimeState): void => {
  setTimeout(() => {
    runtime.stopped = true
    notifyWorkerLoop(runtime)
    runtime.requestExit?.({
      code: 75,
      reason: 'manager_restart',
    })
    void bestEffort('persistRuntimeState: manager_restart', () =>
      persistRuntimeState(runtime),
    )
  }, 100)
}

const writeStateMarkdown = async (
  path: string,
  content: string,
): Promise<void> => {
  await ensureDir(dirname(path))
  await writeFile(path, content, 'utf8')
}

const readCurrentPersona = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return ''
    throw error
  }
}

const backupPersonaVersion = async (
  runtime: RuntimeState,
  previous: string,
): Promise<void> => {
  if (!previous) return
  await ensureDir(runtime.paths.agentPersonaVersionsDir)
  const versionFile = join(
    runtime.paths.agentPersonaVersionsDir,
    `${nowIso().replace(/[:.]/g, '-')}-${newId()}.md`,
  )
  await writeFile(versionFile, previous, 'utf8')
}
export const applyCancelTaskAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = cancelSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const { id } = parsed.data
  await cancelTask(runtime, id, { source: 'deferred' })
}

export const compressManagerContext = async (
  runtime: RuntimeState,
  options?: { reason?: string },
): Promise<void> => {
  const prompt = await buildCompressPrompt(runtime)
  const result = await runManagerLlmCall({
    prompt,
    workDir: runtime.config.workDir,
    model: runtime.config.manager.model,
    logPath: runtime.paths.log,
    logContext: {
      action: 'compress_context',
      ...(options?.reason ? { reason: options.reason } : {}),
    },
  })
  const compressed = normalizeCompressedContext(result.output)
  if (!compressed) throw new Error('compress_context_empty_summary')
  runtime.managerCompressedContext = compressed
  await persistRuntimeState(runtime)
}

export const applyCompressContextAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = compressContextSchema.safeParse(item.attrs)
  if (!parsed.success) return
  await compressManagerContext(runtime, { reason: 'action' })
}

export const applyRestartRuntimeAction = (
  runtime: RuntimeState,
  item: Parsed,
): Promise<boolean> => {
  const parsed = restartSchema.safeParse(item.attrs)
  if (!parsed.success) return Promise.resolve(false)
  requestManagerRestart(runtime)
  return Promise.resolve(true)
}

export const applyWritePersonaAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = writePersonaSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const next = normalizeProfileContent(parsed.data.content)
  const current = await readCurrentPersona(runtime.paths.agentPersona)
  if (current === next) return
  await backupPersonaVersion(runtime, current)
  await writeStateMarkdown(runtime.paths.agentPersona, next)
}

export const applyWriteUserProfileAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = writeUserProfileSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const next = normalizeProfileContent(parsed.data.content)
  const current = await readTextFileIfExists(runtime.paths.userProfile)
  if (current === next) return
  await writeStateMarkdown(runtime.paths.userProfile, next)
}
