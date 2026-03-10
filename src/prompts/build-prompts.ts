import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import { type MemoryScoreContext } from '../memory/entry-score.js'
import { buildMemoryPromptSections } from '../memory/prompt-sections.js'
import { readMemoryEntries } from '../memory/store.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  encodePromptJsonSection,
  encodePromptTextSection,
  mergeTaskResults,
} from './build-prompts-helpers.js'
import { prepareWorkerTaskPrompt } from './build-worker-task-prompt.js'
import { escapeCdata, stringifyPromptJson } from './format-base.js'
import {
  formatWorkerFocusContext,
  type WorkerCompressedFocusContext,
} from './format-worker-focus-context.js'
import {
  buildQuoteReferenceLookup,
  formatActionFeedback,
  formatEnvironment,
  formatFocusContexts,
  formatFocusList,
  formatHistoryLookup,
  formatInputs,
  formatPlansJson,
  formatQueryLookup,
  formatReadFileLookup,
  formatResultsJson,
  formatTasksJson,
  renderPromptTemplate,
} from './format.js'
import { loadPromptFile, loadPromptSource } from './prompt-loader.js'

import type { AppConfig } from '../config.js'
import type {
  FocusContext,
  FocusId,
  FocusMeta,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  QueryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../types/index.js'
import type { ProviderPromptSegment } from '@mimikit/providers/providers/types'

export type { ManagerEnv } from '../types/index.js'

export type PromptSectionLimits = AppConfig['manager']['promptSections']

type ManagerPromptPayload = {
  prefix: string
  suffix: string
  prompt: string
  promptSegments: ProviderPromptSegment[]
}
export type { ManagerPromptPayload }

const MAX_MEMORY_QUERY_CHARS = 4_000
const MAX_MEMORY_MENTION_ITEMS = 128
const MAX_RECENT_HISTORY_SUMMARY_ITEMS = 8

const CONTEXT_EMPTY_VALUES: Record<string, string> = {
  environment: '',
  focus_list: '',
  focus_contexts: '',
  remembered_memory: '',
  memory: '',
  tasks: '',
  plans: '',
  recent_history: '',
  inputs: '',
  batch_results: '',
  history_lookup: '',
  query_lookup: '',
  file_lookup: '',
  action_feedback: '',
}

const pushMention = (target: string[], value: string | undefined): void => {
  const normalized = value?.trim()
  if (!normalized) return
  target.push(normalized)
}

const buildMemoryPromptScoreContext = (params: {
  inputs: UserInput[]
  tasks: Task[]
  plans: TaskPlan[]
  focusPayload: ReturnType<typeof buildFocusPromptPayload>
  workingFocusIds: FocusId[]
}): MemoryScoreContext => {
  const mentionTexts: string[] = []
  for (const input of params.inputs) pushMention(mentionTexts, input.text)
  for (const task of params.tasks) {
    pushMention(mentionTexts, task.title)
    pushMention(mentionTexts, task.result?.output)
  }
  for (const plan of params.plans) pushMention(mentionTexts, plan.title)
  for (const focus of params.focusPayload.focusList)
    pushMention(mentionTexts, focus.title)
  for (const context of params.focusPayload.focusContexts) {
    pushMention(mentionTexts, context.summary)
    for (const openItem of context.openItems ?? [])
      pushMention(mentionTexts, openItem)
  }

  const uniqueForQuery: string[] = []
  const querySeen = new Set<string>()
  for (const item of mentionTexts) {
    const key = item.trim().toLowerCase()
    if (!key || querySeen.has(key)) continue
    querySeen.add(key)
    uniqueForQuery.push(item)
  }
  const queryText = uniqueForQuery
    .slice(0, MAX_MEMORY_MENTION_ITEMS)
    .join('\n')
    .slice(0, MAX_MEMORY_QUERY_CHARS)

  return {
    queryText,
    mentionTexts: mentionTexts.slice(0, MAX_MEMORY_MENTION_ITEMS),
    workingFocusIds: params.workingFocusIds,
  }
}

export const buildManagerPromptPayload = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: PromptSectionLimits
  plans?: TaskPlan[]
  historyLookup?: HistoryLookupMessage[]
  queryLookup?: QueryLookupMessage
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  focusContexts?: FocusContext[]
  workingFocusIds?: FocusId[]
}): Promise<ManagerPromptPayload> => {
  const pendingResults = mergeTaskResults(params.results, [])
  const knownResults = mergeTaskResults(
    pendingResults,
    collectTaskResults(params.tasks),
  )
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const resultTaskIds = collectResultTaskIds(params.tasks)
  const dateHints = buildTaskResultDateHints(params.tasks)
  const statePaths = buildPaths(params.stateDir)
  const memoryEntries = await readMemoryEntries(statePaths.memoryFile)
  const history = await readHistory(statePaths.history)
  const archivedResults =
    resultTaskIds.length > 0
      ? await readTaskResultsForTasks(params.stateDir, resultTaskIds, {
          dateHints,
        })
      : []
  const mergedResults = mergeTaskResults(knownResults, archivedResults)
  const resultsForTasks = mergedResults.filter(
    (result) => !pendingResultIds.has(result.taskId),
  )
  const focusPayload = buildFocusPromptPayload({
    focuses: params.focuses ?? [],
    focusContexts: params.focusContexts ?? [],
    history,
    workingFocusIds: params.workingFocusIds ?? [],
  })
  const quoteLookup = buildQuoteReferenceLookup({
    history,
    inputs: params.inputs,
  })

  const systemSource = await loadPromptSource('manager/system.md')
  const limits = params.promptSectionLimits
  const sectionText = (value: string, maxBytes: number): string =>
    encodePromptTextSection(value, maxBytes)
  const sectionJson = (value: string, maxBytes: number): string =>
    encodePromptJsonSection(value, maxBytes)
  const memoryScoreContext = buildMemoryPromptScoreContext({
    inputs: params.inputs,
    tasks: params.tasks,
    plans: params.plans ?? [],
    focusPayload,
    workingFocusIds: params.workingFocusIds ?? [],
  })
  const memoryPrompts = buildMemoryPromptSections({
    entries: memoryEntries,
    context: memoryScoreContext,
    maxBytes: limits.memoryMaxBytes,
  })
  const summarizeRecentHistory = (): string => {
    const recent = focusPayload.recentHistory
    if (recent.length === 0) return ''
    const sorted = [...recent]
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt)
          return left.createdAt.localeCompare(right.createdAt)

        return left.id.localeCompare(right.id)
      })
      .slice(Math.max(0, recent.length - MAX_RECENT_HISTORY_SUMMARY_ITEMS))
    const byRole = new Map<string, number>()
    for (const item of sorted) {
      const { role } = item
      byRole.set(role, (byRole.get(role) ?? 0) + 1)
    }
    const roleSummary = Array.from(byRole.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([role, count]) => `${role}:${count}`)
      .join(',')
    const latest = sorted[sorted.length - 1]
    const summary = {
      summary: {
        recent_count: recent.length,
        sampled_count: sorted.length,
        role_counts: roleSummary,
        latest_time: latest?.createdAt ?? '',
        latest_id: latest?.id ?? '',
      },
      pointers: sorted.map((item) => ({
        id: item.id,
        role: item.role,
        time: item.createdAt,
        focus_id: item.focusId,
      })),
    }
    return stringifyPromptJson(summary)
  }

  const environment = sectionText(
    formatEnvironment({
      workDir: params.workDir,
      ...(params.env ? { env: params.env } : {}),
    }),
    limits.environmentMaxBytes,
  )
  const inputs = sectionJson(
    formatInputs(params.inputs, quoteLookup),
    limits.inputsMaxBytes,
  )
  const batchResults = sectionJson(
    formatResultsJson(params.tasks, pendingResults, params.workDir),
    limits.batchResultsMaxBytes,
  )
  const tasks = sectionJson(
    formatTasksJson(params.tasks, resultsForTasks, params.workDir),
    limits.tasksMaxBytes,
  )
  const plans = sectionJson(
    formatPlansJson(params.plans ?? []),
    limits.plansMaxBytes,
  )
  const recentHistory = sectionText(
    summarizeRecentHistory(),
    limits.recentHistoryMaxBytes,
  )
  const focusList = sectionJson(
    formatFocusList(focusPayload.focusList),
    limits.focusListMaxBytes,
  )
  const focusContexts = sectionJson(
    formatFocusContexts(focusPayload.focusContexts),
    limits.focusContextsMaxBytes,
  )
  const historyLookup = sectionJson(
    formatHistoryLookup(params.historyLookup ?? []),
    limits.historyLookupMaxBytes,
  )
  const queryLookup = sectionText(
    formatQueryLookup(params.queryLookup),
    limits.queryLookupMaxBytes,
  )
  const rememberedMemory = sectionText(
    memoryPrompts.rememberedMemory,
    limits.memoryMaxBytes,
  )
  const memory = sectionText(memoryPrompts.memory, limits.memoryMaxBytes)
  const fileLookup = sectionJson(
    formatReadFileLookup(params.readFileLookup ?? []),
    limits.fileLookupMaxBytes,
  )
  const actionFeedback = sectionJson(
    formatActionFeedback(params.actionFeedback ?? []),
    limits.actionFeedbackMaxBytes,
  )

  const contextSource = await loadPromptSource('manager/context.md')
  const prefix = renderPromptTemplate(
    systemSource.template,
    CONTEXT_EMPTY_VALUES,
    systemSource.path,
  ).trim()
  const stableContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      focus_list: focusList,
      focus_contexts: focusContexts,
      remembered_memory: rememberedMemory,
      memory,
      tasks,
      plans,
    },
    contextSource.path,
  ).trim()
  const volatileContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      environment,
      inputs,
      batch_results: batchResults,
      history_lookup: historyLookup,
      query_lookup: queryLookup,
      file_lookup: fileLookup,
      action_feedback: actionFeedback,
      recent_history: recentHistory,
    },
    contextSource.path,
  ).trim()
  const suffix = [stableContext, volatileContext]
    .filter((segment) => segment.length > 0)
    .join('\n\n')
    .trim()
  const promptSegments: ProviderPromptSegment[] = [
    { text: prefix, cacheControl: 'ephemeral' as const },
    { text: stableContext, cacheControl: 'ephemeral' as const },
    { text: volatileContext },
  ].filter(
    (segment): segment is ProviderPromptSegment =>
      segment.text.trim().length > 0,
  )
  if (promptSegments.length === 1) promptSegments.push({ text: suffix })
  return {
    prefix,
    suffix,
    prompt: [prefix, stableContext, volatileContext]
      .filter((segment) => segment.length > 0)
      .join('\n\n')
      .trim(),
    promptSegments,
  }
}

export const buildManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: PromptSectionLimits
  plans?: TaskPlan[]
  historyLookup?: HistoryLookupMessage[]
  queryLookup?: QueryLookupMessage
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  focusContexts?: FocusContext[]
  workingFocusIds?: FocusId[]
}): Promise<string> => (await buildManagerPromptPayload(params)).prompt

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
  focusMeta?: FocusMeta
  focusContext?: FocusContext
  compressedFocusContext?: WorkerCompressedFocusContext
}): Promise<string> => {
  const systemSource = await loadPromptSource('worker/system.md')
  let taskPrompt = await prepareWorkerTaskPrompt({
    workDir: params.workDir,
    taskId: params.task.id,
    taskCreatedAt: params.task.createdAt,
    taskPrompt: params.task.prompt,
  })
  if (params.task.cron || params.task.scheduledAt) {
    const prefix = await loadPromptFile('worker', 'cron-trigger-context')
    if (prefix) taskPrompt = `${prefix.trim()}\n\n${taskPrompt}`
  }
  const focusContext = formatWorkerFocusContext({
    focusId: params.task.focusId,
    ...(params.focusMeta ? { focusMeta: params.focusMeta } : {}),
    ...(params.focusContext ? { focusContext: params.focusContext } : {}),
    ...(params.compressedFocusContext
      ? { compressedFocusContext: params.compressedFocusContext }
      : {}),
  })
  return renderPromptTemplate(
    systemSource.template,
    {
      environment: escapeCdata(formatEnvironment({ workDir: params.workDir })),
      prompt: escapeCdata(taskPrompt),
      focus_context: focusContext ? escapeCdata(focusContext) : '',
    },
    systemSource.path,
  )
}
