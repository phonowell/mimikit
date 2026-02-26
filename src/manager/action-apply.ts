import {
  assignFocusByTargetId,
  enforceFocusCapacity,
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
  updateFocus,
  parseFocusOpenItems,
} from '../focus/index.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'
import { runWithProvider } from '../providers/registry.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'
import { newId, nowIso } from '../shared/utils.js'
import { appendHistory, readHistory } from '../history/store.js'
import { cancelTask } from '../worker/cancel-task.js'

import {
  applyRunTask,
  applyScheduleTask,
  type ApplyTaskActionsOptions,
} from './action-apply-create.js'
import {
  applyCreateIntent,
  applyDeleteIntent,
  applyUpdateIntent,
} from './action-apply-intent.js'
import {
  assignFocusSchema,
  cancelSchema,
  collectTaskResultSummaries,
  compressContextSchema,
  createFocusSchema,
  restartSchema,
  updateFocusSchema,
} from './action-apply-schema.js'
import { resolveManagerTimeoutMs } from './runner.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export { collectTaskResultSummaries }

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

const applyCompressContext = async (
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

const requestManagerRestart = (runtime: RuntimeState): void => {
  setTimeout(() => {
    void (async () => {
      runtime.stopped = true
      notifyWorkerLoop(runtime)
      await bestEffort('persistRuntimeState: manager_restart', () =>
        persistRuntimeState(runtime),
      )
      process.exit(75)
    })()
  }, 100)
}

const appendCronCanceledSystemMessage = async (
  runtime: RuntimeState,
  cronJobId: string,
  title: string,
  focusId: string,
): Promise<void> => {
  const label = title.trim() || cronJobId
  const createdAt = nowIso()
  await appendHistory(runtime.paths.history, {
    id: `sys-cron-canceled-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary: `Canceled task "${label}".`,
      event: 'cron_canceled',
      payload: {
        cron_job_id: cronJobId,
        label,
        ...(title.trim() ? { title: title.trim() } : {}),
      },
    }),
    createdAt,
    focusId,
  })
}

const applyCreateFocus = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = createFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  ensureFocus(runtime, parsed.data.id, parsed.data.title)
  if (
    parsed.data.status !== undefined ||
    parsed.data.summary !== undefined ||
    parsed.data.open_items !== undefined
  ) {
    const openItems = parseFocusOpenItems(parsed.data.open_items)
    updateFocus(runtime, {
      id: parsed.data.id,
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
      ...(openItems !== undefined ? { openItems } : {}),
    })
  }
  touchFocus(runtime, parsed.data.id)
  enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}

const applyUpdateFocus = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = updateFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const openItems = parseFocusOpenItems(parsed.data.open_items)
  updateFocus(runtime, {
    id: parsed.data.id,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(openItems !== undefined ? { openItems } : {}),
  })
  enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}

const applyAssignFocus = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = assignFocusSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const assigned = await assignFocusByTargetId(
    runtime,
    parsed.data.target_id,
    parsed.data.focus_id,
  )
  if (!assigned) return
  enforceFocusCapacity(runtime)
  await persistRuntimeState(runtime)
}

export const applyTaskActions = async (
  runtime: RuntimeState,
  items: Parsed[],
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.name === 'create_intent') {
      await applyCreateIntent(runtime, item)
      continue
    }
    if (item.name === 'update_intent') {
      await applyUpdateIntent(runtime, item)
      continue
    }
    if (item.name === 'delete_intent') {
      await applyDeleteIntent(runtime, item)
      continue
    }
    if (item.name === 'run_task') {
      await applyRunTask(runtime, item, seen, options)
      continue
    }
    if (item.name === 'schedule_task') {
      await applyScheduleTask(runtime, item, seen)
      continue
    }
    if (item.name === 'cancel_task') {
      const parsed = cancelSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      const { id } = parsed.data
      const canceled = await cancelTask(runtime, id, { source: 'deferred' })
      if (canceled.ok || canceled.status !== 'not_found') continue
      const cronJob = runtime.cronJobs.find((job) => job.id === id)
      if (!cronJob?.enabled) continue
      cronJob.enabled = false
      cronJob.disabledReason = 'canceled'
      await persistRuntimeState(runtime)
      await bestEffort('appendHistory: cron_task_canceled', () =>
        appendCronCanceledSystemMessage(
          runtime,
          cronJob.id,
          cronJob.title,
          cronJob.focusId,
        ),
      )
      continue
    }
    if (item.name === 'compress_context') {
      await applyCompressContext(runtime, item)
      continue
    }
    if (item.name === 'create_focus') {
      await applyCreateFocus(runtime, item)
      continue
    }
    if (item.name === 'update_focus') {
      await applyUpdateFocus(runtime, item)
      continue
    }
    if (item.name === 'assign_focus') {
      await applyAssignFocus(runtime, item)
      continue
    }
    if (item.name === 'restart_runtime') {
      const parsed = restartSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      requestManagerRestart(runtime)
      return
    }
  }
  ensureFocus(runtime, resolveDefaultFocusId(runtime))
  enforceFocusCapacity(runtime)
}
