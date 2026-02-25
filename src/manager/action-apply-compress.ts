import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'
import { runWithProvider } from '../providers/registry.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'
import { readHistory } from '../storage/history-jsonl.js'

import { compressContextSchema } from './action-apply-schema.js'
import { resolveManagerTimeoutMs } from './runner-budget.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const MAX_COMPRESSED_CONTEXT_CHARS = 4_000
const MAX_HISTORY_ITEMS = 40
const MAX_HISTORY_LINE_CHARS = 220
const MAX_TASK_ITEMS = 20
const MAX_PROMPT_CHARS = 16_000

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

export const applyCompressContext = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = compressContextSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const prompt = await buildCompressPrompt(runtime)
  const timeoutMs = resolveManagerTimeoutMs(prompt)
  const result = await runWithProvider({
    provider: 'openai-chat',
    role: 'manager',
    prompt,
    workDir: runtime.config.workDir,
    timeoutMs,
    model: runtime.config.manager.model,
    logPath: runtime.paths.log,
    logContext: {
      action: 'compress_context',
    },
  })
  const compressed = normalizeCompressedContext(result.output)
  if (!compressed) throw new Error('compress_context_empty_summary')
  runtime.managerCompressedContext = compressed
  await persistRuntimeState(runtime)
}
