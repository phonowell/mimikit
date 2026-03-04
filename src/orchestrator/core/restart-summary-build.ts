import { truncateText } from '../../shared/text.js'

import type { ChatMessage } from '../read-model/chat-view.js'
import type { FocusView } from '../read-model/focus-view.js'
import type { TaskCounts, TaskView } from '../read-model/task-view.js'
import type { PendingUserChoice, TaskPlan } from '../../types/index.js'

const MAX_MESSAGE_ITEMS = 10
const MAX_MESSAGE_CHARS = 220
const MAX_TASK_ITEMS = 8
const MAX_PLAN_ITEMS = 6
const MAX_FOCUS_ITEMS = 6
const MAX_TITLE_CHARS = 96
const MAX_DETAIL_CHARS = 160
const TASK_STATUS_ORDER = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const

export type RestartSummaryContext = {
  messages: ChatMessage[]
  tasks?: TaskView[]
  taskCounts?: TaskCounts
  plans?: TaskPlan[]
  focuses?: FocusView[]
  pendingChoice?: PendingUserChoice | null
}

const normalizeRoleLabel = (role: ChatMessage['role']): string => {
  if (role === 'user') return 'User'
  if (role === 'agent') return 'Assistant'
  return 'System'
}

const normalizeSummaryLine = (value: string): string =>
  value.replace(/^system:\s*/i, '').trim()

const toSummaryLines = (messages: ChatMessage[]): string[] => {
  const candidates = messages
    .map((message) => ({
      role: normalizeRoleLabel(message.role),
      text: normalizeSummaryLine(message.text),
    }))
    .filter((item) => item.text.length > 0)
  if (candidates.length === 0) return []
  const scoped = candidates.slice(Math.max(0, candidates.length - MAX_MESSAGE_ITEMS))
  return scoped.map(
    (item) =>
      `- ${item.role}: ${truncateText(item.text, MAX_MESSAGE_CHARS, { normalizeWhitespace: true })}`,
  )
}

const toTaskCounts = (
  tasks: TaskView[],
  counts?: TaskCounts,
): Record<(typeof TASK_STATUS_ORDER)[number], number> => {
  const resolved = {
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
  }
  if (counts) {
    for (const key of TASK_STATUS_ORDER) {
      const value = counts[key]
      resolved[key] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    }
    return resolved
  }
  for (const task of tasks) resolved[task.status] += 1
  return resolved
}

const buildTaskSection = (tasks: TaskView[], counts?: TaskCounts): string | undefined => {
  const resolvedCounts = toTaskCounts(tasks, counts)
  const total = TASK_STATUS_ORDER.reduce((sum, key) => sum + resolvedCounts[key], 0)
  if (total === 0) return undefined
  const highlights = tasks.slice(0, MAX_TASK_ITEMS).map((task) => {
    const title = truncateText(task.title || task.id, MAX_TITLE_CHARS, {
      normalizeWhitespace: true,
    })
    return `- [${task.status}] ${title} (${task.id})`
  })
  const countLine = TASK_STATUS_ORDER.map(
    (key) => `${key}=${resolvedCounts[key]}`,
  ).join(', ')
  return ['Task snapshot before reset:', `- Counts: ${countLine}`, ...highlights].join(
    '\n',
  )
}

const formatPlanTrigger = (plan: TaskPlan): string => {
  if (plan.trigger.mode === 'cron') return `cron:${plan.trigger.cron}`
  if (plan.trigger.mode === 'scheduled_at')
    return `scheduled_at:${plan.trigger.scheduledAt}`
  if (plan.trigger.mode === 'on_idle') return `on_idle:${plan.trigger.cooldownMs}ms`
  return 'on_worker_slot_freed'
}

const buildPlanSection = (plans: TaskPlan[]): string | undefined => {
  const candidates = plans.filter((plan) => plan.status !== 'done')
  if (candidates.length === 0) return undefined
  const lines = candidates.slice(0, MAX_PLAN_ITEMS).map((plan) => {
    const title = truncateText(plan.title || plan.id, MAX_TITLE_CHARS, {
      normalizeWhitespace: true,
    })
    return `- [${plan.status}/${formatPlanTrigger(plan)}] ${title} (${plan.id})`
  })
  return ['Plan snapshot before reset:', ...lines].join('\n')
}

const buildFocusSection = (focuses: FocusView[]): string | undefined => {
  if (focuses.length === 0) return undefined
  const lines = focuses.slice(0, MAX_FOCUS_ITEMS).map((focus) => {
    const title = truncateText(focus.title || focus.id, MAX_TITLE_CHARS, {
      normalizeWhitespace: true,
    })
    const parts = [`- [${focus.isActive ? 'active' : focus.status}] ${title} (${focus.id})`]
    if (focus.summary && focus.summary !== focus.title) {
      parts.push(
        `summary=${truncateText(focus.summary, MAX_DETAIL_CHARS, { normalizeWhitespace: true })}`,
      )
    }
    if (focus.openItems?.length) {
      const openItems = truncateText(focus.openItems.join('; '), MAX_DETAIL_CHARS, {
        normalizeWhitespace: true,
      })
      parts.push(`open=${openItems}`)
    }
    return parts.join(' | ')
  })
  return ['Focus snapshot before reset:', ...lines].join('\n')
}

const buildPendingChoiceSection = (
  pendingChoice?: PendingUserChoice | null,
): string | undefined => {
  if (!pendingChoice) return undefined
  const defaultOption = pendingChoice.options.find(
    (option) => option.id === pendingChoice.defaultOptionId,
  )
  const options = pendingChoice.options.map((option) => option.label).join(', ')
  return [
    'Pending decision before reset:',
    `- Question: ${truncateText(pendingChoice.question, MAX_DETAIL_CHARS, { normalizeWhitespace: true })}`,
    `- Default: ${truncateText(defaultOption?.label ?? pendingChoice.defaultOptionId, MAX_DETAIL_CHARS, { normalizeWhitespace: true })}`,
    `- Options: ${truncateText(options, MAX_DETAIL_CHARS, { normalizeWhitespace: true })}`,
  ].join('\n')
}

export const buildConversationSummaryForReset = (
  params: RestartSummaryContext,
): string => {
  const messageLines = toSummaryLines(params.messages)
  const sections = [
    messageLines.length
      ? `Conversation highlights before reset:\n${messageLines.join('\n')}`
      : 'No prior conversation content was available before reset.',
    buildTaskSection(params.tasks ?? [], params.taskCounts),
    buildPlanSection(params.plans ?? []),
    buildFocusSection(params.focuses ?? []),
    buildPendingChoiceSection(params.pendingChoice),
  ].filter((item): item is string => Boolean(item))
  return sections.join('\n\n')
}
