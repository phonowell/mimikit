import { resolve } from 'node:path'

import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurfacePromptConfig,
} from '../manager/action-surface-prompt.js'
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
  buildFocusListPromptPayload,
  buildHistoryLookupPromptPayload,
  buildInputsPromptPayload,
  buildPlansPromptPayload,
  buildQuoteReferenceLookup,
  buildReadFileLookupPromptPayload,
  buildTasksPromptPayload,
  buildWorkingFocusesPromptPayload,
  formatActionFeedback,
  formatEnvironment,
  formatFocusList,
  formatHistoryLookup,
  formatInputs,
  formatPlansJson,
  formatQueryLookup,
  formatReadFileLookup,
  formatResultsJson,
  formatTasksJson,
  formatWorkingFocuses,
  renderPromptTemplate,
} from './format.js'
import {
  buildManagerContextPacket,
  shouldIncludePacketSection,
} from './manager-context-packet.js'
import { buildManagerEventDigests } from './manager-event-digests.js'
import { loadPromptFile, loadPromptSource } from './prompt-loader.js'

import type { AppConfig } from '../config.js'
import type { ProviderPromptSegment } from '../providers/types.js'
import type {
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

type BuildManagerPromptParams = {
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
  workingFocusIds?: FocusId[]
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
}

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

type SelectablePacketSection = Exclude<ManagerPacketSection, 'packet_summary'>
type PacketSections = Record<ManagerPacketSection, string>

const SELECTABLE_PACKET_SECTIONS = [
  'environment',
  'focus_list',
  'working_focuses',
  'remembered_memory',
  'memory',
  'tasks',
  'plans',
  'inputs',
  'batch_results',
  'recent_history',
  'history_lookup',
  'query_lookup',
  'file_lookup',
  'action_feedback',
] satisfies readonly SelectablePacketSection[]

const selectPacketSections = (params: {
  sections: PacketSections
  mode: ManagerPacketMode
  wakeProfile: NonNullable<ManagerEnv['wakeProfile']>
}): {
  selectedSections: PacketSections
  includedSections: ManagerPacketSection[]
  prunedSections: ManagerPacketSection[]
} => {
  const selectedSections: PacketSections = { ...params.sections }
  const includedSections: ManagerPacketSection[] = []
  const prunedSections: ManagerPacketSection[] = []
  for (const section of SELECTABLE_PACKET_SECTIONS) {
    const value = params.sections[section]
    const hasContent = value.trim().length > 0
    const include = shouldIncludePacketSection({
      mode: params.mode,
      wakeProfile: params.wakeProfile,
      section,
      hasContent,
    })
    if (include) {
      includedSections.push(section)
      continue
    }
    if (hasContent) prunedSections.push(section)
    selectedSections[section] = ''
  }
  return { selectedSections, includedSections, prunedSections }
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
  for (const focus of params.focusPayload.workingFocuses) {
    pushMention(mentionTexts, focus.summary)
    for (const openItem of focus.openItems ?? [])
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

export const buildManagerPromptPayload = async (
  params: BuildManagerPromptParams,
): Promise<ManagerPromptPayload> => {
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
    resolveManagerActionSurfacePromptConfig({
      wakeProfile,
      packetMode,
      ...(params.actionFeedback
        ? { actionFeedback: params.actionFeedback }
        : {}),
    }),
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

  const environmentSource = formatEnvironment({
    workDir: params.workDir,
    ...(params.env ? { env: params.env } : {}),
  })
  const environment = sectionText(environmentSource, limits.environmentMaxBytes)
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
  const recentHistorySource = summarizeRecentHistory()
  const focusList = sectionJson(
    formatFocusList(focusPayload.focusList),
    limits.focusListMaxBytes,
  )
  const workingFocuses = sectionJson(
    formatWorkingFocuses(focusPayload.workingFocuses),
    limits.workingFocusesMaxBytes,
  )
  const historyLookup = sectionJson(
    formatHistoryLookup(params.historyLookup ?? []),
    limits.historyLookupMaxBytes,
  )
  const queryLookupSource = formatQueryLookup(params.queryLookup)
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
  const digestSections = buildManagerEventDigests({
    recentHistory: focusPayload.recentHistory,
    recentHistorySource,
    ...(params.queryLookup ? { queryLookup: params.queryLookup } : {}),
    queryLookupSource,
    tasks: params.tasks,
    pendingResults,
    batchResultsSource: batchResults,
  })
  const sectionSources: PacketSections = {
    packet_summary: '',
    environment,
    focus_list: focusList,
    working_focuses: workingFocuses,
    remembered_memory: rememberedMemory,
    memory,
    tasks,
    plans,
    inputs,
    batch_results: digestSections.batchResults,
    recent_history: digestSections.recentHistory,
    history_lookup: historyLookup,
    query_lookup: digestSections.queryLookup,
    file_lookup: fileLookup,
    action_feedback: actionFeedback,
  }
  const { selectedSections, includedSections, prunedSections } =
    selectPacketSections({
      sections: sectionSources,
      mode: packetMode,
      wakeProfile,
    })
  const includedSectionSet = new Set(includedSections)
  const includedSectionDigests = digestSections.sectionDigests.filter((item) =>
    includedSectionSet.has(item.section),
  )
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
    ...(includedSectionDigests.length > 0
      ? { sectionDigests: includedSectionDigests }
      : {}),
  })
  const packetSummary = packetBundle.summaryText
  const statePacket = sectionText(
    stringifyPromptJson({
      ...(selectedSections.focus_list
        ? { focus_list: buildFocusListPromptPayload(focusPayload.focusList) }
        : {}),
      ...(selectedSections.working_focuses
        ? {
            working_focuses: buildWorkingFocusesPromptPayload(
              focusPayload.workingFocuses,
            ),
          }
        : {}),
      ...(selectedSections.tasks
        ? {
            tasks: buildTasksPromptPayload(
              params.tasks,
              resultsForTasks,
              params.workDir,
            ),
          }
        : {}),
      ...(selectedSections.plans
        ? { plans: buildPlansPromptPayload(params.plans ?? []) }
        : {}),
    }),
    limits.focusListMaxBytes +
      limits.workingFocusesMaxBytes +
      limits.tasksMaxBytes +
      limits.plansMaxBytes +
      limits.packetSummaryMaxBytes,
  )
  const eventPacket = sectionText(
    stringifyPromptJson({
      ...(selectedSections.environment
        ? {
            environment: environmentSource,
          }
        : {}),
      ...(selectedSections.inputs
        ? { inputs: buildInputsPromptPayload(params.inputs, quoteLookup) }
        : {}),
      ...(selectedSections.batch_results
        ? { batch_results: digestSections.batchResultsPayload }
        : {}),
      ...(selectedSections.recent_history
        ? { recent_history: digestSections.recentHistoryPayload }
        : {}),
      ...(selectedSections.history_lookup
        ? {
            history_lookup: buildHistoryLookupPromptPayload(
              params.historyLookup ?? [],
            ),
          }
        : {}),
      ...(selectedSections.query_lookup
        ? { query_lookup: digestSections.queryLookupPayload }
        : {}),
      ...(selectedSections.file_lookup
        ? {
            file_lookup: buildReadFileLookupPromptPayload(
              params.readFileLookup ?? [],
            ),
          }
        : {}),
      ...(selectedSections.action_feedback
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
      remembered_memory: selectedSections.remembered_memory,
    },
    contextSource.path,
  ).trim()
  const volatileContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      event_packet: eventPacket,
      memory: selectedSections.memory,
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

export const buildManagerPrompt = async (
  params: BuildManagerPromptParams,
): Promise<string> => (await buildManagerPromptPayload(params)).prompt

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
