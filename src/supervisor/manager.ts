import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runManager } from '../roles/runner.js'
import { sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/history.js'
import { enqueueTask } from '../tasks/queue.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'
import type { TaskResult } from '../types/tasks.js'

type ManagerBuffer = {
  inputs: RuntimeState['pendingInputs']
  results: TaskResult[]
  lastInputAt: number
  firstResultAt: number
}

type ParsedCommand = {
  action: string
  attrs: Record<string, string>
  content?: string
}

const MIMIKIT_TAG = /<MIMIKIT:(\w+)([^>]*?)(?:\/>|>([\s\S]*?)<\/MIMIKIT:\1>)/g
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g

const parseAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(ATTR_RE)) {
    const key = match[1]
    const value = match[2] ?? ''
    if (!key) continue
    attrs[key] = value
  }
  return attrs
}

const parseCommands = (
  output: string,
): {
  commands: ParsedCommand[]
  text: string
} => {
  const commands = [...output.matchAll(MIMIKIT_TAG)].map((match) => {
    const content = match[3]?.trim()
    return {
      action: match[1] ?? '',
      attrs: parseAttrs(match[2] ?? ''),
      ...(content ? { content } : {}),
    }
  })
  const text = output.replace(MIMIKIT_TAG, '').trim()
  return { commands, text }
}

const DEFAULT_MANAGER_TIMEOUT_MS = 30_000

const createBuffer = (): ManagerBuffer => ({
  inputs: [],
  results: [],
  lastInputAt: 0,
  firstResultAt: 0,
})

const clearBuffer = (buffer: ManagerBuffer): void => {
  buffer.inputs = []
  buffer.results = []
  buffer.lastInputAt = 0
  buffer.firstResultAt = 0
}

const appendFallbackReply = async (paths: RuntimeState['paths']) => {
  await appendHistory(paths.history, {
    id: `sys-${Date.now()}`,
    role: 'system',
    text: '系统暂时不可用，请稍后再试。',
    createdAt: nowIso(),
  })
}

const runManagerBuffer = async (
  runtime: RuntimeState,
  buffer: ManagerBuffer,
) => {
  const inputs = buffer.inputs.map((input) => input.text)
  const { results } = buffer
  const historyLimit = Math.max(0, runtime.config.manager.historyLimit)
  const history = await readHistory(runtime.paths.history)
  const excludeIds = new Set(buffer.inputs.map((input) => input.id))
  const filteredHistory = history.filter((item) => !excludeIds.has(item.id))
  const recentHistory =
    historyLimit > 0
      ? filteredHistory.slice(
          Math.max(0, filteredHistory.length - historyLimit),
        )
      : []
  const startedAt = Date.now()
  runtime.managerRunning = true
  try {
    const { model } = runtime.config.manager
    const { modelReasoningEffort } = runtime.config.manager
    await appendLog(runtime.paths.log, {
      event: 'manager_start',
      inputCount: inputs.length,
      resultCount: results.length,
      historyCount: recentHistory.length,
      historyLimit,
      inputIds: buffer.inputs.map((input) => input.id),
      resultIds: results.map((result) => result.taskId),
      pendingTaskCount: runtime.tasks.filter(
        (task) => task.status === 'pending',
      ).length,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })
    const result = await runManager({
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks: runtime.tasks,
      history: recentHistory,
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      timeoutMs: DEFAULT_MANAGER_TIMEOUT_MS,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })
    const parsed = parseCommands(result.output)
    for (const command of parsed.commands) {
      if (command.action !== 'dispatch_worker') continue
      const content = command.content?.trim()
      const prompt =
        content && content.length > 0
          ? content
          : (command.attrs.prompt?.trim() ?? '')
      if (!prompt) continue
      enqueueTask(runtime.tasks, prompt)
    }
    if (parsed.text) {
      await appendHistory(runtime.paths.history, {
        id: `manager-${Date.now()}`,
        role: 'manager',
        text: parsed.text,
        createdAt: nowIso(),
        elapsedMs: result.elapsedMs,
        ...(result.usage ? { usage: result.usage } : {}),
      })
    }
    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.fallbackUsed ? { fallbackUsed: true } : {}),
    })
    clearBuffer(buffer)
  } catch (error) {
    await safe(
      'appendLog: manager_end',
      () =>
        appendLog(runtime.paths.log, {
          event: 'manager_end',
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Math.max(0, Date.now() - startedAt),
        }),
      { fallback: undefined },
    )
    await appendFallbackReply(runtime.paths)
    clearBuffer(buffer)
  } finally {
    runtime.managerRunning = false
  }
}

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  const buffer = createBuffer()
  while (!runtime.stopped) {
    const now = Date.now()
    if (runtime.pendingInputs.length > 0) {
      const drained = runtime.pendingInputs.splice(0)
      buffer.inputs.push(...drained)
      buffer.lastInputAt = now
    }

    if (runtime.pendingResults.length > 0) {
      const drained = runtime.pendingResults.splice(0)
      buffer.results.push(...drained)
      if (buffer.firstResultAt === 0) buffer.firstResultAt = now
    }

    const hasInputs = buffer.inputs.length > 0
    const hasResults = buffer.results.length > 0
    const debounceReady =
      hasInputs && now - buffer.lastInputAt >= runtime.config.manager.debounceMs
    const resultsReady =
      hasResults &&
      !hasInputs &&
      now - buffer.firstResultAt >= runtime.config.manager.maxResultWaitMs

    if ((debounceReady || resultsReady) && (hasInputs || hasResults))
      await runManagerBuffer(runtime, buffer)

    await sleep(runtime.config.manager.pollMs)
  }
}
