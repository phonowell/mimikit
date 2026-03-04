import { readHistory } from '../history/store.js'
import {
  findFocus,
  findFocusCompressedContext,
  resolveDefaultFocusId,
  upsertFocusCompressedContext,
} from '../focus/index.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'
import { compareIsoDesc } from '../shared/time.js'
import { truncateText } from '../shared/text.js'

import { compressContextSchema } from './action-apply-schema.js'
import { runManagerLlmCall } from './manager-llm-call.js'
import { resolveRuntimeManagerMode } from './manager-mode-runtime.js'
import {
  persistRuntimeState,
  type RuntimeState,
} from './runtime-adapter.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'

import type { Parsed } from '../actions/model/spec.js'
import type { FocusId } from '../types/index.js'

const MAX_COMPRESSED_CONTEXT_CHARS = 4_000
const MAX_HISTORY_ITEMS = 40
const MAX_HISTORY_LINE_CHARS = 220
const MAX_TASK_ITEMS = 20
const MAX_PROMPT_CHARS = 16_000
const AUTO_REFRESH_INTERVAL_TURNS = 6
const MAX_PROACTIVE_FOCUSES = 1

const normalizeCompressedContext = (value: string): string => {
  const normalized = value.trim().replace(/\r\n/g, '\n')
  if (normalized.length <= MAX_COMPRESSED_CONTEXT_CHARS) return normalized
  return `${normalized.slice(0, MAX_COMPRESSED_CONTEXT_CHARS - 1).trimEnd()}…`
}

const resolveCompressionFocusIds = (
  runtime: RuntimeState,
  focusIds?: FocusId[],
): FocusId[] => {
  const requested = focusIds?.filter((id, index, source) => source.indexOf(id) === index)
  if (requested && requested.length > 0) {
    return requested.filter((id) => findFocus(runtime, id)?.status !== 'archived')
  }
  const active = runtime.activeFocusIds.filter(
    (id, index, source) =>
      source.indexOf(id) === index && findFocus(runtime, id)?.status !== 'archived',
  )
  if (active.length > 0) return active
  return [resolveDefaultFocusId(runtime)]
}

const shouldProactiveCompressFocus = (
  runtime: RuntimeState,
  focusId: FocusId,
): boolean => {
  const focus = findFocus(runtime, focusId)
  if (!focus || focus.status === 'archived') return false
  const current = findFocusCompressedContext(runtime, focusId)
  if (!current) return true
  if (compareIsoDesc(focus.lastActivityAt, current.updatedAt) >= 0) return false
  return runtime.managerTurn % AUTO_REFRESH_INTERVAL_TURNS === 0
}

const formatHistorySection = async (
  runtime: RuntimeState,
  focusId: FocusId,
): Promise<string> => {
  const history = await readHistory(runtime.paths.history)
  const visible = history.filter(
    (item) => isVisibleToAgent(item) && item.focusId === focusId,
  )
  const recent = visible.slice(Math.max(0, visible.length - MAX_HISTORY_ITEMS))
  if (recent.length === 0) return '无'
  return recent
    .map(
      (item, index) =>
        `${index + 1}. [${item.createdAt}] (${item.role}) ${truncateText(item.text, MAX_HISTORY_LINE_CHARS, { normalizeWhitespace: true })}`,
    )
    .join('\n')
}

const formatTasksSection = (runtime: RuntimeState, focusId: FocusId): string => {
  const scopedTasks = runtime.tasks.filter((task) => task.focusId === focusId)
  if (scopedTasks.length === 0) return '无'
  return scopedTasks
    .slice(Math.max(0, scopedTasks.length - MAX_TASK_ITEMS))
    .map((task, index) => {
      const resultSummary = task.result?.output
        ? truncateText(task.result.output, 120, { normalizeWhitespace: true })
        : ''
      return `${index + 1}. [${task.status}] id=${task.id} title=${truncateText(task.title, 80, { normalizeWhitespace: true })}${resultSummary ? ` result=${resultSummary}` : ''}`
    })
    .join('\n')
}

const renderCompressMaterial = (params: {
  template: string
  focusId: FocusId
  existingText: string
  historyText: string
  tasksText: string
}): string =>
  params.template
    .replace('{{focus_id}}', params.focusId)
    .replace('{{existing_compressed_context}}', params.existingText)
    .replace('{{recent_history}}', params.historyText)
    .replace('{{tasks_snapshot}}', params.tasksText)

const buildCompressPrompt = async (
  runtime: RuntimeState,
  focusId: FocusId,
): Promise<string | undefined> => {
  const base = (await loadPromptFile('manager', 'compress-context')).trim()
  if (!base)
    throw new Error('missing_prompt_template:manager/compress-context.md')

  const materialTemplate = (
    await loadPromptFile('manager', 'compress-context-material')
  ).trim()
  if (!materialTemplate)
    throw new Error(
      'missing_prompt_template:manager/compress-context-material.md',
    )

  const historyText = await formatHistorySection(runtime, focusId)
  const tasksText = formatTasksSection(runtime, focusId)
  const existing = findFocusCompressedContext(runtime, focusId)?.summary.trim()
  const existingText = existing && existing.length > 0 ? existing : '无'

  if (historyText === '无' && tasksText === '无' && existingText === '无')
    return undefined

  const prompt = [
    base,
    '',
    renderCompressMaterial({
      template: materialTemplate,
      focusId,
      existingText,
      historyText,
      tasksText,
    }),
  ].join('\n')

  if (prompt.length <= MAX_PROMPT_CHARS) return prompt
  return `${prompt.slice(0, MAX_PROMPT_CHARS - 1).trimEnd()}…`
}

const compressFocusContext = async (
  runtime: RuntimeState,
  focusId: FocusId,
  options?: { reason?: string },
): Promise<boolean> => {
  const prompt = await buildCompressPrompt(runtime, focusId)
  if (!prompt) return false
  const result = await runManagerLlmCall({
    prompt,
    workDir: runtime.config.workDir,
    model: runtime.config.manager.model,
    mode: resolveRuntimeManagerMode(runtime),
    logPath: runtime.paths.log,
    logContext: {
      action: 'compress_context',
      focusId,
      ...(options?.reason ? { reason: options.reason } : {}),
    },
  })
  const compressed = normalizeCompressedContext(result.output)
  if (!compressed) throw new Error('compress_context_empty_summary')
  upsertFocusCompressedContext(runtime, {
    focusId,
    summary: compressed,
  })
  await persistRuntimeState(runtime)
  return true
}

export const compressManagerContext = async (
  runtime: RuntimeState,
  options?: {
    reason?: string
    focusIds?: FocusId[]
  },
): Promise<FocusId[]> => {
  const targetFocusIds = resolveCompressionFocusIds(runtime, options?.focusIds)
  const compressedFocusIds: FocusId[] = []
  for (const focusId of targetFocusIds) {
    const compressed = await compressFocusContext(runtime, focusId, options)
    if (compressed) compressedFocusIds.push(focusId)
  }
  return compressedFocusIds
}

export const proactiveCompressManagerContext = async (
  runtime: RuntimeState,
  focusIds: FocusId[],
): Promise<FocusId[]> => {
  const targetFocusIds = resolveCompressionFocusIds(runtime, focusIds)
    .filter((id) => shouldProactiveCompressFocus(runtime, id))
    .slice(0, MAX_PROACTIVE_FOCUSES)
  if (targetFocusIds.length === 0) return []
  return compressManagerContext(runtime, {
    reason: 'auto_preflight',
    focusIds: targetFocusIds,
  })
}

export const applyCompressContextAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = compressContextSchema.safeParse(item.attrs)
  if (!parsed.success) return
  await compressManagerContext(runtime, { reason: 'action' })
}
