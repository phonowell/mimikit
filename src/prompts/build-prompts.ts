import { resolve } from 'node:path'

import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurface,
} from '../manager/action-surface.js'
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
  formatTaskFocusBrief,
  type TaskFocusBrief,
} from './format-task-focus-brief.js'
import {
  buildActionFeedbackPromptPayload,
  buildFocusDigestsPromptPayload,
  buildFocusListPromptPayload,
  buildHistoryLookupPromptPayload,
  buildInputsPromptPayload,
  buildPlansPromptPayload,
  buildQuoteReferenceLookup,
  buildReadFileLookupPromptPayload,
  buildResultsPromptPayload,
  buildTasksPromptPayload,
  formatActionFeedback,
  formatEnvironment,
  formatFocusDigests,
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
import {
  buildManagerContextPacket,
  shouldIncludePacketSection,
} from './manager-context-packet.js'
import { loadPromptFile, loadPromptSource } from './prompt-loader.js'

import type { AppConfig } from '../config.js'
import type { ProviderPromptSegment } from '../providers/types.js'
import type {
  FocusDigest,
  FocusId,
  FocusMeta,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerContextPacket,
  ManagerEnv,
  ManagerPacketMode,
  ManagerPacketSection,
  QueryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type { ManagerEnv } from '../types/index.js'

export type PromptSectionLimits = AppConfig['manager']['promptSections']

type ManagerPromptPayload = {
  prefix: string
  suffix: string
  prompt: string
  promptSegments: ProviderPromptSegment[]
  contextPacket: ManagerContextPacket
  packetSummary: string
}
export type { ManagerPromptPayload }

const MAX_MEMORY_QUERY_CHARS = 4_000
const MAX_MEMORY_MENTION_ITEMS = 128
const MAX_RECENT_HISTORY_SUMMARY_ITEMS = 8

const CONTEXT_EMPTY_VALUES: Record<string, string> = {
  action_surface: '',
  state_packet: '',
  event_packet: '',
  remembered_memory: '',
  memory: '',
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
  for (const digest of params.focusPayload.focusDigests) {
    pushMention(mentionTexts, digest.summary)
    for (const openItem of digest.openItems ?? [])
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
  focusDigests?: FocusDigest[]
  workingFocusIds?: FocusId[]
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
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
    focusDigests: params.focusDigests ?? [],
    history,
    workingFocusIds: params.workingFocusIds ?? [],
  })
  const quoteLookup = buildQuoteReferenceLookup({
    history,
    inputs: params.inputs,
  })

  const systemSource = await loadPromptSource('manager/system.md')
  const limits = params.promptSectionLimits
  const wakeProfile = params.wakeProfile ?? params.env?.wakeProfile ?? 'mixed'
  const packetMode = params.packetMode ?? 'standard'
  const actionSurface = formatManagerActionSurfacePrompt(
    resolveManagerActionSurface(wakeProfile),
  )
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
  const focusDigests = sectionJson(
    formatFocusDigests(focusPayload.focusDigests),
    limits.focusDigestsMaxBytes,
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
  const rawSections: Record<ManagerPacketSection, string> = {
    packet_summary: '',
    environment,
    focus_list: focusList,
    focus_digests: focusDigests,
    remembered_memory: rememberedMemory,
    memory,
    tasks,
    plans,
    inputs,
    batch_results: batchResults,
    recent_history: recentHistory,
    history_lookup: historyLookup,
    query_lookup: queryLookup,
    file_lookup: fileLookup,
    action_feedback: actionFeedback,
  }
  const includedSections: ManagerPacketSection[] = []
  const prunedSections: ManagerPacketSection[] = []
  const selectSection = (section: ManagerPacketSection): string => {
    const value = rawSections[section]
    const include = shouldIncludePacketSection({
      mode: packetMode,
      wakeProfile,
      section,
      hasContent: value.trim().length > 0,
    })
    if (include) includedSections.push(section)
    else if (value.trim().length > 0) prunedSections.push(section)
    return include ? value : ''
  }
  const selectedEnvironment = selectSection('environment')
  const selectedFocusList = selectSection('focus_list')
  const selectedFocusDigests = selectSection('focus_digests')
  const selectedRememberedMemory = selectSection('remembered_memory')
  const selectedMemory = selectSection('memory')
  const selectedTasks = selectSection('tasks')
  const selectedPlans = selectSection('plans')
  const selectedInputs = selectSection('inputs')
  const selectedBatchResults = selectSection('batch_results')
  const selectedRecentHistory = selectSection('recent_history')
  const selectedHistoryLookup = selectSection('history_lookup')
  const selectedQueryLookup = selectSection('query_lookup')
  const selectedFileLookup = selectSection('file_lookup')
  const selectedActionFeedback = selectSection('action_feedback')
  const packetBundle = buildManagerContextPacket({
    wakeProfile,
    mode: packetMode,
    inputs: params.inputs,
    results: pendingResults,
    tasks: params.tasks,
    plans: params.plans ?? [],
    workingFocusIds: params.workingFocusIds ?? [],
    includedSections: ['packet_summary', ...includedSections],
    prunedSections,
  })
  const packetSummary = packetBundle.summaryText
  const statePacket = sectionText(
    stringifyPromptJson({
      ...(selectedFocusList
        ? { focus_list: buildFocusListPromptPayload(focusPayload.focusList) }
        : {}),
      ...(selectedFocusDigests
        ? {
            focus_digests: buildFocusDigestsPromptPayload(
              focusPayload.focusDigests,
            ),
          }
        : {}),
      ...(selectedTasks
        ? {
            tasks: buildTasksPromptPayload(
              params.tasks,
              resultsForTasks,
              params.workDir,
            ),
          }
        : {}),
      ...(selectedPlans
        ? { plans: buildPlansPromptPayload(params.plans ?? []) }
        : {}),
    }),
    limits.focusListMaxBytes +
      limits.focusDigestsMaxBytes +
      limits.tasksMaxBytes +
      limits.plansMaxBytes +
      limits.packetSummaryMaxBytes,
  )
  const eventPacket = sectionText(
    stringifyPromptJson({
      ...(selectedEnvironment
        ? {
            environment: formatEnvironment({
              workDir: params.workDir,
              ...(params.env ? { env: params.env } : {}),
            }),
          }
        : {}),
      ...(selectedInputs
        ? { inputs: buildInputsPromptPayload(params.inputs, quoteLookup) }
        : {}),
      ...(selectedBatchResults
        ? {
            batch_results: buildResultsPromptPayload(
              params.tasks,
              pendingResults,
              params.workDir,
            ),
          }
        : {}),
      ...(selectedRecentHistory
        ? { recent_history: summarizeRecentHistory() }
        : {}),
      ...(selectedHistoryLookup
        ? {
            history_lookup: buildHistoryLookupPromptPayload(
              params.historyLookup ?? [],
            ),
          }
        : {}),
      ...(selectedQueryLookup ? { query_lookup: params.queryLookup } : {}),
      ...(selectedFileLookup
        ? {
            file_lookup: buildReadFileLookupPromptPayload(
              params.readFileLookup ?? [],
            ),
          }
        : {}),
      ...(selectedActionFeedback
        ? {
            action_feedback: buildActionFeedbackPromptPayload(
              params.actionFeedback ?? [],
            ),
          }
        : {}),
      packet: packetBundle.packet,
    }),
    limits.environmentMaxBytes +
      limits.inputsMaxBytes +
      limits.batchResultsMaxBytes +
      limits.recentHistoryMaxBytes +
      limits.historyLookupMaxBytes +
      limits.queryLookupMaxBytes +
      limits.fileLookupMaxBytes +
      limits.actionFeedbackMaxBytes +
      limits.packetSummaryMaxBytes,
  )

  const contextSource = await loadPromptSource('manager/context.md')
  const prefix = renderPromptTemplate(
    systemSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      action_surface: actionSurface,
    },
    systemSource.path,
  ).trim()
  const stableContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      state_packet: statePacket,
      remembered_memory: selectedRememberedMemory,
    },
    contextSource.path,
  ).trim()
  const volatileContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      event_packet: eventPacket,
      memory: selectedMemory,
    },
    contextSource.path,
  ).trim()
  const suffix = [stableContext, volatileContext]
    .filter((segment) => segment.length > 0)
    .join('\n\n')
    .trim()
  const promptSegments: ProviderPromptSegment[] = [
    { text: prefix },
    { text: stableContext },
    { text: volatileContext, cacheControl: 'ephemeral' as const },
  ].filter(
    (segment): segment is ProviderPromptSegment =>
      segment.text.trim().length > 0,
  )
  if (promptSegments.length === 1) promptSegments.push({ text: suffix })
  return {
    prefix,
    suffix,
    contextPacket: packetBundle.packet,
    packetSummary,
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
  focusDigests?: FocusDigest[]
  workingFocusIds?: FocusId[]
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
}): Promise<string> => (await buildManagerPromptPayload(params)).prompt

export const buildWorkerPrompt = async (params: {
  stateDir: string
  workspaceDir: string
  task: Task
  focusBrief?: TaskFocusBrief
}): Promise<string> => {
  const systemSource = await loadPromptSource('worker/system.md')
  let taskPrompt = await prepareWorkerTaskPrompt({
    workDir: params.stateDir,
    taskId: params.task.id,
    taskCreatedAt: params.task.createdAt,
    taskPrompt: params.task.prompt,
  })
  if (params.task.cron || params.task.scheduledAt) {
    const prefix = await loadPromptFile('worker', 'cron-trigger-context')
    if (prefix) taskPrompt = `${prefix.trim()}\n\n${taskPrompt}`
  }
  const focusBrief = formatTaskFocusBrief(params.focusBrief)
  return renderPromptTemplate(
    systemSource.template,
    {
      environment: escapeCdata(
        formatEnvironment({
          stateDir: params.stateDir,
          workDir: params.workspaceDir,
          generatedDir: resolve(params.stateDir, 'generated'),
        }),
      ),
      prompt: escapeCdata(taskPrompt),
      focus_brief: focusBrief ? escapeCdata(focusBrief) : '',
    },
    systemSource.path,
  )
}
