import { stringifyPromptJson } from '../../foundation/prompting/format-base.js'
import { truncateText } from '../../foundation/shared/text.js'
import { newId, nowIso } from '../../foundation/shared/utils.js'

import type {
  FocusId,
  ManagerContextPacket,
  ManagerPacketMode,
  ManagerPacketSection,
  ManagerWakeProfile,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'

const PREVIEW_MAX_CHARS = 140
const MAX_PACKET_IDS = 5

const MINIMAL_SECTIONS = new Set<ManagerPacketSection>([
  'packet_summary',
  'environment',
  'focus_list',
  'working_focuses',
  'remembered_memory',
  'tasks',
  'plans',
])

const STANDARD_SECTIONS = new Set<ManagerPacketSection>([
  ...MINIMAL_SECTIONS,
  'inputs',
  'batch_results',
  'recent_history',
  'memory',
])

export const resolveManagerPacketMode = (params: {
  wakeProfile: ManagerWakeProfile
  round: number
  hasActionFeedback: boolean
}): ManagerPacketMode => {
  if (params.round >= 2) return 'expanded'
  if (params.hasActionFeedback) return 'expanded'
  if (
    params.wakeProfile === 'trigger' ||
    params.wakeProfile === 'capacity' ||
    params.wakeProfile === 'task_result'
  )
    return 'minimal'
  return 'standard'
}

const wantsSectionByMode = (
  mode: ManagerPacketMode,
  section: ManagerPacketSection,
): boolean => {
  if (mode === 'expanded') return true
  if (mode === 'standard') return STANDARD_SECTIONS.has(section)
  return MINIMAL_SECTIONS.has(section)
}

export const shouldIncludePacketSection = (params: {
  mode: ManagerPacketMode
  wakeProfile: ManagerWakeProfile
  section: ManagerPacketSection
  hasContent: boolean
}): boolean => {
  if (!params.hasContent) return false
  if (params.section === 'packet_summary') return true
  if (params.section === 'action_feedback') return true
  if (
    params.section === 'working_focuses' &&
    params.wakeProfile === 'capacity' &&
    params.mode === 'minimal'
  )
    return false
  if (params.section === 'inputs') {
    return (
      params.wakeProfile === 'user_input' ||
      params.wakeProfile === 'mixed' ||
      params.mode !== 'minimal'
    )
  }
  if (params.section === 'batch_results') {
    return (
      params.wakeProfile === 'task_result' ||
      params.wakeProfile === 'mixed' ||
      params.mode !== 'minimal'
    )
  }
  if (params.section === 'recent_history')
    return params.mode === 'expanded' || params.mode === 'standard'
  if (params.section === 'memory') return params.mode !== 'minimal'
  return wantsSectionByMode(params.mode, params.section)
}

const summarizeLatestResult = (
  tasks: Task[],
  results: TaskResult[],
):
  | {
      taskId: string
      status: TaskResult['status']
      focusId?: FocusId
      summary?: string
      stopReason?: string
      archivePath?: string
    }
  | undefined => {
  const latest = results[0]
  if (!latest) return undefined
  const task = tasks.find((item) => item.id === latest.taskId)
  const summarySource =
    latest.handoff?.summary ?? latest.output.split(/\r?\n/, 1)[0] ?? ''
  return {
    taskId: latest.taskId,
    status: latest.status,
    ...(task?.focusId ? { focusId: task.focusId } : {}),
    ...(summarySource
      ? {
          summary: truncateText(summarySource, PREVIEW_MAX_CHARS, {
            normalizeWhitespace: true,
            suffix: '…',
          }),
        }
      : {}),
    ...(latest.stopReason ? { stopReason: latest.stopReason } : {}),
    ...(latest.archivePath ? { archivePath: latest.archivePath } : {}),
  }
}

export const buildManagerContextPacket = (params: {
  wakeProfile: ManagerWakeProfile
  mode: ManagerPacketMode
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: FocusId[]
  sectionDigests?: ManagerContextPacket['sectionDigests']
  includedSections: ManagerPacketSection[]
  prunedSections: ManagerPacketSection[]
}): {
  packet: ManagerContextPacket
  summaryText: string
} => {
  const latestUserInput = [...params.inputs]
    .reverse()
    .find((item) => item.role === 'user')
  const packet: ManagerContextPacket = {
    id: `packet-${newId()}`,
    createdAt: nowIso(),
    wakeProfile: params.wakeProfile,
    mode: params.mode,
    counts: {
      inputs: params.inputs.length,
      results: params.results.length,
      tasks: params.tasks.length,
      plans: params.plans.length,
      workingFocuses: params.workingFocusIds.length,
    },
    ...(latestUserInput
      ? {
          latestUserInput: {
            id: latestUserInput.id,
            focusId: latestUserInput.focusId,
            text: truncateText(latestUserInput.text, PREVIEW_MAX_CHARS, {
              normalizeWhitespace: true,
              suffix: '…',
            }),
          },
        }
      : {}),
    ...(summarizeLatestResult(params.tasks, params.results)
      ? { latestResult: summarizeLatestResult(params.tasks, params.results) }
      : {}),
    activeTaskIds: params.tasks
      .filter((task) => task.status === 'pending' || task.status === 'running')
      .map((task) => task.id)
      .slice(0, MAX_PACKET_IDS),
    activePlanIds: params.plans
      .filter((plan) => plan.status === 'active')
      .map((plan) => plan.id)
      .slice(0, MAX_PACKET_IDS),
    workingFocusIds: params.workingFocusIds.slice(0, MAX_PACKET_IDS),
    ...(params.sectionDigests?.length
      ? { sectionDigests: params.sectionDigests }
      : {}),
    includedSections: [...params.includedSections],
    prunedSections: [...params.prunedSections],
  }
  return {
    packet,
    summaryText: stringifyPromptJson(packet),
  }
}
