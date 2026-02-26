import { parseActions } from '../actions/protocol/parse.js'
import {
  collectPreferredFocusIds,
  resolveDefaultFocusId,
  selectWorkingFocusIds,
} from '../focus/index.js'
import { appendLog } from '../log/append.js'
import {
  selectRecentIntents,
  selectRecentTasks,
} from '../orchestrator/read-model/intent-select.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'
import { readHistory } from '../history/store.js'

import {
  type FeedbackContext,
  REGISTERED_MANAGER_ACTIONS,
  validateRegisteredManagerAction,
} from './action-feedback-validate.js'
import { pickQueryHistoryRequest, queryHistory } from '../history/query.js'
import { appendActionFeedbackSystemMessage } from '../history/manager-events.js'
import {
  resetUiStream,
  setUiStreamText,
  setUiStreamUsage,
  toVisibleAgentText,
} from './loop-ui-stream.js'
import { runManager } from './runner.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const STREAM_TEXT_FLUSH_MS = 64
const INTENT_TRIGGER_EVENT_RE =
  /<M:system_event[^>]*name="intent_trigger"[^>]*>([\s\S]*?)<\/M:system_event>/g

const escapeAttr = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const renderAttemptedAction = (item: Parsed): string => {
  const attrs = Object.entries(item.attrs)
  if (attrs.length === 0) return `<M:${item.name} />`
  const attrsText = attrs
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(' ')
  return `<M:${item.name} ${attrsText} />`
}

const pushFeedback = (
  feedback: ManagerActionFeedback[],
  seen: Set<string>,
  item: Parsed,
  error: string,
  hint: string,
): void => {
  const attempted = renderAttemptedAction(item)
  const key = `${error}\n${attempted}`
  if (seen.has(key)) return
  seen.add(key)
  feedback.push({ action: item.name, error, hint, attempted })
}

export const collectManagerActionFeedback = (
  items: Parsed[],
  context: FeedbackContext = {},
): ManagerActionFeedback[] => {
  const feedback: ManagerActionFeedback[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) {
      pushFeedback(
        feedback,
        seen,
        item,
        'unregistered_action',
        '仅可使用已注册 action：M:create_focus, M:update_focus, M:assign_focus, M:create_intent, M:update_intent, M:delete_intent, M:run_task, M:schedule_task, M:cancel_task, M:compress_context, M:summarize_task_result, M:query_history, M:restart_runtime。',
      )
    }
  }
  const seenWithUnknown = new Set(
    feedback.map((item) => `${item.error}\n${item.attempted ?? ''}`),
  )
  for (const item of items) {
    if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) continue
    const issues = validateRegisteredManagerAction(item, context)
    for (const issue of issues)
      pushFeedback(feedback, seenWithUnknown, item, issue.error, issue.hint)
  }
  return feedback
}

const collectTriggeredIntentIds = (inputs: UserInput[]): Set<string> => {
  const ids = new Set<string>()
  for (const input of inputs) {
    if (input.role !== 'system') continue
    if (!input.text.includes('name="intent_trigger"')) continue
    INTENT_TRIGGER_EVENT_RE.lastIndex = 0
    let match = INTENT_TRIGGER_EVENT_RE.exec(input.text)
    while (match) {
      const raw = match[1]?.trim()
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { intent_id?: unknown }
          const id =
            typeof payload.intent_id === 'string'
              ? payload.intent_id.trim()
              : ''
          if (id) ids.add(id)
        } catch {}
      }
      match = INTENT_TRIGGER_EVENT_RE.exec(input.text)
    }
  }
  return ids
}

export const runManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  streamId: string
}): Promise<{
  parsed: ReturnType<typeof parseActions>
  usage?: TokenUsage
  elapsedMs: number
}> => {
  const { runtime, inputs, results, streamId } = params
  await appendLog(runtime.paths.log, {
    event: 'manager_start',
    inputCount: inputs.length,
    resultCount: results.length,
    inputIds: inputs.map((item) => item.id),
    resultIds: results.map((item) => item.taskId),
  })

  const tasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.taskWindow.minCount,
    maxCount: runtime.config.manager.taskWindow.maxCount,
    maxBytes: runtime.config.manager.taskWindow.maxBytes,
  })
  const triggerIntentIds = collectTriggeredIntentIds(inputs)
  const intentsSource = [
    ...runtime.idleIntents,
    ...runtime.idleIntentArchive,
  ].filter((intent) => !triggerIntentIds.has(intent.id))
  const intents = selectRecentIntents(intentsSource, {
    minCount: runtime.config.manager.intentWindow.minCount,
    maxCount: runtime.config.manager.intentWindow.maxCount,
    maxBytes: runtime.config.manager.intentWindow.maxBytes,
  })
  const preferredFocusIds = collectPreferredFocusIds(runtime, inputs, results)
  const workingFocusIds = selectWorkingFocusIds(runtime, preferredFocusIds)

  let streamRawOutput = ''
  let streamVisibleOutput = ''
  let streamUsage: TokenUsage | undefined
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null

  const clearStreamFlushTimer = (): void => {
    if (!streamFlushTimer) return
    clearTimeout(streamFlushTimer)
    streamFlushTimer = null
  }

  const flushVisibleStream = (): void => {
    streamFlushTimer = null
    const nextVisible = toVisibleAgentText(streamRawOutput)
    if (nextVisible !== streamVisibleOutput) {
      streamVisibleOutput = nextVisible
      setUiStreamText(runtime, streamId, nextVisible)
    }
    if (!streamUsage) return
    streamUsage =
      setUiStreamUsage(runtime, streamId, streamUsage) ?? streamUsage
  }

  const scheduleVisibleStreamFlush = (): void => {
    if (streamFlushTimer) return
    streamFlushTimer = setTimeout(flushVisibleStream, STREAM_TEXT_FLUSH_MS)
  }

  const runOnce = async (extra?: {
    historyLookup?: HistoryLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  }) => {
    let callUsage: TokenUsage | undefined
    const result = await runManager({
      stateDir: runtime.config.workDir,
      workDir: runtime.config.workDir,
      inputs,
      results,
      tasks,
      intents,
      cronJobs: runtime.cronJobs,
      focuses: runtime.focuses,
      focusContexts: runtime.focusContexts,
      activeFocusIds: runtime.activeFocusIds,
      workingFocusIds,
      ...(extra?.historyLookup ? { historyLookup: extra.historyLookup } : {}),
      ...(extra?.actionFeedback
        ? { actionFeedback: extra.actionFeedback }
        : {}),
      ...(runtime.managerCompressedContext
        ? { compressedContext: runtime.managerCompressedContext }
        : {}),
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      model: runtime.config.manager.model,
      maxPromptTokens: runtime.config.manager.prompt.maxTokens,
      onTextDelta: (delta) => {
        if (!delta) return
        streamRawOutput += delta
        scheduleVisibleStreamFlush()
      },
      onUsage: (usage) => {
        callUsage = usage
        streamUsage = usage
        scheduleVisibleStreamFlush()
      },
    })
    const resolvedUsage = result.usage ?? callUsage
    if (resolvedUsage) {
      streamUsage = resolvedUsage
      scheduleVisibleStreamFlush()
    }
    return {
      ...result,
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    }
  }

  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let previousQueryKey: string | undefined
  let extra: {
    historyLookup?: HistoryLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  } = {}

  try {
    for (;;) {
      const runResult = await runOnce(extra)
      elapsedMs += runResult.elapsedMs
      batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)
      const parsed = parseActions(runResult.output)
      if (streamVisibleOutput !== parsed.text) {
        clearStreamFlushTimer()
        flushVisibleStream()
        streamVisibleOutput = parsed.text
        setUiStreamText(runtime, streamId, parsed.text)
      }
      const scheduleNowIso =
        runtime.lastUserMeta?.clientNowIso ?? new Date().toISOString()
      const actionFeedback = collectManagerActionFeedback(parsed.actions, {
        taskStatusById: new Map(
          runtime.tasks.map((task) => [task.id, task.status]),
        ),
        enabledCronJobIds: new Set(
          runtime.cronJobs.filter((job) => job.enabled).map((job) => job.id),
        ),
        intentStatusById: new Map(
          [...runtime.idleIntents, ...runtime.idleIntentArchive].map(
            (intent) => [intent.id, intent.status],
          ),
        ),
        hasCompressibleContext:
          Boolean(runtime.managerCompressedContext?.trim()) ||
          runtime.tasks.length > 0 ||
          inputs.length > 0 ||
          results.length > 0 ||
          runtime.queues.inputsCursor > 0 ||
          runtime.queues.resultsCursor > 0,
        scheduleNowIso,
      })
      const queryRequest = pickQueryHistoryRequest(parsed.actions)
      const queryKey = queryRequest
        ? [
            queryRequest.query,
            String(queryRequest.limit),
            queryRequest.roles.join(','),
            queryRequest.beforeId ?? '',
            String(queryRequest.fromMs ?? ''),
            String(queryRequest.toMs ?? ''),
          ].join('\n')
        : undefined

      if (!queryRequest && actionFeedback.length === 0) {
        clearStreamFlushTimer()
        flushVisibleStream()
        if (streamVisibleOutput !== parsed.text) {
          streamVisibleOutput = parsed.text
          setUiStreamText(runtime, streamId, parsed.text)
        }
        return {
          parsed,
          elapsedMs,
          ...(batchUsage ? { usage: batchUsage } : {}),
        }
      }
      if (
        queryKey &&
        actionFeedback.length === 0 &&
        previousQueryKey === queryKey
      )
        throw new Error('manager_query_history_repeated_without_progress')
      previousQueryKey = queryKey

      let historyLookup: HistoryLookupMessage[] | undefined
      if (queryRequest) {
        const history = await readHistory(runtime.paths.history)
        historyLookup = queryHistory(history, queryRequest)
        await appendLog(runtime.paths.log, {
          event: 'manager_query_history',
          queryChars: queryRequest.query.length,
          limit: queryRequest.limit,
          roleCount: queryRequest.roles.length,
          resultCount: historyLookup.length,
          ...(queryRequest.beforeId ? { beforeId: queryRequest.beforeId } : {}),
          ...(queryRequest.fromMs !== undefined
            ? { fromMs: queryRequest.fromMs }
            : {}),
          ...(queryRequest.toMs !== undefined
            ? { toMs: queryRequest.toMs }
            : {}),
        })
      }
      if (actionFeedback.length > 0) {
        await appendLog(runtime.paths.log, {
          event: 'manager_action_feedback',
          count: actionFeedback.length,
          errors: actionFeedback.map((item) => item.error),
          names: actionFeedback.map((item) => item.action),
        })
        await appendActionFeedbackSystemMessage(
          runtime.paths.history,
          actionFeedback,
          resolveDefaultFocusId(runtime),
        )
      }

      clearStreamFlushTimer()
      flushVisibleStream()
      streamRawOutput = ''
      streamVisibleOutput = ''
      resetUiStream(runtime, streamId)
      extra = {
        ...(historyLookup ? { historyLookup } : {}),
        ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
      }
    }
  } finally {
    clearStreamFlushTimer()
  }
}
