import { appendLog } from '../log/append.js'
import { bestEffort, safe } from '../log/safe.js'
import { runManager } from '../roles/runner.js'
import { nowIso, sleep } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/jsonl.js'
import { enqueueTask } from '../tasks/queue.js'

import { cancelTask } from './cancel.js'
import { parseCommands } from './command-parser.js'
import { selectRecentHistory } from './history-select.js'
import { executeReadFileTool } from './read-file-tool.js'
import { appendTaskSystemMessage } from './task-history.js'
import { selectRecentTasks } from './task-select.js'

import type { RuntimeState } from './runtime.js'
import type { ManagerToolResult } from '../roles/prompt.js'
import type { HistoryMessage, TaskResult, UserInput } from '../types/index.js'

type ManagerBuffer = {
  inputs: RuntimeState['pendingInputs']
  results: TaskResult[]
  lastInputAt: number
  firstResultAt: number
}

const DEFAULT_MANAGER_TIMEOUT_MS = 30_000
const READ_FILE_MAX_CALLS_PER_TURN = 3
const READ_FILE_DEFAULT_LINES = 100
const READ_FILE_MAX_LINES = 500
const READ_FILE_MAX_BYTES = 12 * 1024

const parseOptionalPositiveInt = (
  value: string | undefined,
): number | undefined => {
  if (!value) return undefined
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  const normalized = Math.floor(num)
  return normalized > 0 ? normalized : undefined
}

const shouldRunReadFile = (command: { action: string }): boolean =>
  command.action === 'read_file'

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

const syncManagerPendingInputs = (
  runtime: RuntimeState,
  buffer: ManagerBuffer,
): void => {
  runtime.managerPendingInputs = [...buffer.inputs]
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

const createManagerHistoryMessage = (params: {
  text: string
  elapsedMs: number
  usage?: TaskResult['usage']
  suffix: string
}): HistoryMessage => ({
  id: `manager-${Date.now()}-${params.suffix}`,
  role: 'manager',
  text: params.text,
  createdAt: nowIso(),
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
})

const appendHistoryMessages = async (
  historyPath: string,
  messages: HistoryMessage[],
): Promise<void> => {
  for (const message of messages) await appendHistory(historyPath, message)
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
  const nextRoundHistory = [...recentHistory]
  const stagedManagerMessages: HistoryMessage[] = []
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
    const readFileToolResults: ManagerToolResult[] = []
    const maxReadFileCalls = READ_FILE_MAX_CALLS_PER_TURN
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

    let result = await runManager({
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks: recentTasks,
      history: nextRoundHistory,
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      timeoutMs: DEFAULT_MANAGER_TIMEOUT_MS,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })

    let parsed = parseCommands(result.output)
    let readFileCallCount = 0
    let readFileRound = 0
    while (readFileCallCount < maxReadFileCalls) {
      const readFileCommands = parsed.commands.filter(shouldRunReadFile)
      if (readFileCommands.length === 0) break
      readFileRound += 1
      if (parsed.text) {
        const staged = createManagerHistoryMessage({
          text: parsed.text,
          elapsedMs: result.elapsedMs,
          usage: result.usage,
          suffix: `tool-${readFileRound}-${stagedManagerMessages.length}`,
        })
        stagedManagerMessages.push(staged)
        nextRoundHistory.push(staged)
      }
      const remainingCalls = maxReadFileCalls - readFileCallCount
      const commandsToRun = readFileCommands.slice(0, remainingCalls)
      for (const command of commandsToRun) {
        const path = command.attrs.path?.trim() ?? command.content?.trim() ?? ''
        const { attrs } = command
        const start = parseOptionalPositiveInt(attrs.start)
        const limit = parseOptionalPositiveInt(attrs.limit)
        const toolResult = await executeReadFileTool(
          {
            path,
            ...(start !== undefined ? { start } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
          {
            baseDir: runtime.config.workDir,
            defaultLines: READ_FILE_DEFAULT_LINES,
            maxLines: READ_FILE_MAX_LINES,
            maxBytes: READ_FILE_MAX_BYTES,
          },
        )
        readFileToolResults.push({
          tool: 'read_file',
          attrs,
          result: toolResult,
        })
      }
      readFileCallCount += commandsToRun.length
      await appendLog(runtime.paths.log, {
        event: 'manager_tool_round',
        tool: 'read_file',
        round: readFileRound,
        toolCallCount: commandsToRun.length,
        requestedToolCallCount: readFileCommands.length,
      })
      result = await runManager({
        stateDir: runtime.config.stateDir,
        workDir: runtime.config.workDir,
        inputs,
        results,
        tasks: recentTasks,
        history: nextRoundHistory,
        ...(runtime.lastUserMeta
          ? { env: { lastUser: runtime.lastUserMeta } }
          : {}),
        toolResults: readFileToolResults,
        timeoutMs: DEFAULT_MANAGER_TIMEOUT_MS,
        ...(model ? { model } : {}),
        ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
      })
      parsed = parseCommands(result.output)
    }

    if (
      parsed.commands.some(shouldRunReadFile) &&
      readFileCallCount >= maxReadFileCalls
    ) {
      await appendLog(runtime.paths.log, {
        event: 'manager_tool_limit_reached',
        tool: 'read_file',
        maxReadFileCalls,
        readFileCallCount,
      })
    }

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
    await appendHistoryMessages(runtime.paths.history, stagedManagerMessages)
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
      await appendHistory(
        runtime.paths.history,
        createManagerHistoryMessage({
          text: parsed.text,
          elapsedMs: result.elapsedMs,
          usage: result.usage,
          suffix: 'final',
        }),
      )
    }
    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.fallbackUsed ? { fallbackUsed: true } : {}),
    })
    clearBuffer(buffer)
    syncManagerPendingInputs(runtime, buffer)
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
    syncManagerPendingInputs(runtime, buffer)
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
      syncManagerPendingInputs(runtime, buffer)
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
