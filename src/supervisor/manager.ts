import { appendLog } from '../log/append.js'
import { bestEffort, safe } from '../log/safe.js'
import { runManager } from '../roles/runner.js'
import { nowIso, sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import { enqueueTask } from '../tasks/queue.js'

import { cancelTask } from './cancel.js'
import { parseCommands } from './command-parser.js'
import { selectRecentHistory } from './history-select.js'
import { appendTaskSystemMessage } from './task-history.js'
import { selectRecentTasks } from './task-select.js'

import type { RuntimeState } from './runtime.js'
import type { TaskResult, UserInput } from '../types/index.js'

type ManagerBuffer = {
  inputs: RuntimeState['pendingInputs']
  results: TaskResult[]
  lastInputAt: number
  firstResultAt: number
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

const appendConsumedInputsToHistory = async (
  historyPath: string,
  inputs: UserInput[],
): Promise<number> => {
  let consumed = 0
  for (const input of inputs) {
    const appended = await safe(
      'appendHistory: consumed_input',
      async () => {
        await appendHistory(historyPath, {
          id: input.id,
          role: 'user',
          text: input.text,
          createdAt: input.createdAt,
          ...(input.quote ? { quote: input.quote } : {}),
        })
        return true
      },
      { fallback: false, meta: { inputId: input.id } },
    )
    if (!appended) break
    consumed += 1
  }
  return consumed
}

const appendConsumedResultsToHistory = async (
  historyPath: string,
  tasks: RuntimeState['tasks'],
  results: TaskResult[],
): Promise<number> => {
  let consumed = 0
  for (const result of results) {
    const task = tasks.find((item) => item.id === result.taskId)
    if (!task) {
      consumed += 1
      continue
    }
    if (task.result) {
      consumed += 1
      continue
    }
    const appended =
      result.status === 'canceled'
        ? await appendTaskSystemMessage(historyPath, 'canceled', task, {
            createdAt: result.completedAt,
          })
        : await appendTaskSystemMessage(historyPath, 'completed', task, {
            status: result.status,
            createdAt: result.completedAt,
          })
    if (!appended) break
    task.result = result
    consumed += 1
  }
  return consumed
}

const runManagerBuffer = async (
  runtime: RuntimeState,
  buffer: ManagerBuffer,
) => {
  const { inputs } = buffer
  const { results } = buffer
  const history = await readHistory(runtime.paths.history)
  const recentHistory = selectRecentHistory(history, {
    minCount: runtime.config.manager.historyMinCount,
    maxCount: runtime.config.manager.historyMaxCount,
    maxBytes: runtime.config.manager.historyMaxBytes,
  })
  const recentTasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.tasksMinCount,
    maxCount: runtime.config.manager.tasksMaxCount,
    maxBytes: runtime.config.manager.tasksMaxBytes,
  })
  const startedAt = Date.now()
  runtime.managerRunning = true
  let consumedInputCount = 0
  let consumedResultCount = 0
  try {
    const { model, modelReasoningEffort } = runtime.config.manager
    await appendLog(runtime.paths.log, {
      event: 'manager_start',
      inputCount: inputs.length,
      resultCount: results.length,
      historyCount: recentHistory.length,
      inputIds: buffer.inputs.map((input) => input.id),
      resultIds: results.map((result) => result.taskId),
      pendingTaskCount: runtime.tasks.filter(
        (task) => task.status === 'pending',
      ).length,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })
    const result = await runManager({
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks: recentTasks,
      history: recentHistory,
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      timeoutMs: DEFAULT_MANAGER_TIMEOUT_MS,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })
    consumedInputCount = await appendConsumedInputsToHistory(
      runtime.paths.history,
      inputs,
    )
    if (consumedInputCount < inputs.length)
      throw new Error('append_consumed_inputs_incomplete')
    consumedResultCount = await appendConsumedResultsToHistory(
      runtime.paths.history,
      runtime.tasks,
      results,
    )
    if (consumedResultCount < results.length)
      throw new Error('append_consumed_results_incomplete')
    const parsed = parseCommands(result.output)
    const seenDispatches = new Set<string>()
    for (const command of parsed.commands) {
      if (command.action === 'add_task') {
        const content = command.content?.trim()
        const prompt =
          content && content.length > 0
            ? content
            : (command.attrs.prompt?.trim() ?? '')
        if (!prompt) continue
        const rawTitle = command.attrs.title?.trim()
        const dedupeKey = `${prompt}\n${rawTitle ?? ''}`
        if (seenDispatches.has(dedupeKey)) continue
        seenDispatches.add(dedupeKey)
        const { task, created } = enqueueTask(runtime.tasks, prompt, rawTitle)
        if (created) {
          await appendTaskSystemMessage(
            runtime.paths.history,
            'created',
            task,
            {
              createdAt: task.createdAt,
            },
          )
        }
        continue
      }
      if (command.action === 'cancel_task') {
        const id = command.attrs.id?.trim() ?? command.content?.trim()
        if (!id) continue
        await cancelTask(runtime, id, { source: 'manager' })
        continue
      }
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
    const remainingInputs = buffer.inputs.slice(consumedInputCount)
    if (remainingInputs.length > 0)
      runtime.pendingInputs.unshift(...remainingInputs)
    await bestEffort('appendLog: manager_end', () =>
      appendLog(runtime.paths.log, {
        event: 'manager_end',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Math.max(0, Date.now() - startedAt),
        ...(consumedInputCount > 0 ? { consumedInputCount } : {}),
        ...(consumedResultCount > 0 ? { consumedResultCount } : {}),
      }),
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
