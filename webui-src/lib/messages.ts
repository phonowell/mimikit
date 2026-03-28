import { mergeIncomingMessages } from './merge-incoming-messages.js'

import type {
  AppState,
  ChatMessage,
  FocusesSnapshot,
  PlansSnapshot,
  SnapshotEnvelope,
  StatusSnapshot,
  TasksSnapshot,
} from '../types.js'

const MESSAGE_LIMIT = 50

const DEFAULT_STATUS: StatusSnapshot = {
  agentStatus: 'loading',
  activeTasks: 0,
  pendingTasks: 0,
  pendingInputs: 0,
  managerRunning: false,
  maxWorkers: 1,
  runtimeId: '',
}

const normalizeMessages = (value: unknown): ChatMessage[] =>
  Array.isArray((value as { messages?: unknown })?.messages)
    ? (((value as { messages?: ChatMessage[] }).messages as ChatMessage[]) ??
      [])
    : []

const normalizeMode = (value: unknown): string =>
  typeof (value as { mode?: unknown })?.mode === 'string'
    ? ((value as { mode: string }).mode ?? 'full')
    : 'full'

const collectMessageIds = (messages: readonly ChatMessage[]): Set<string> => {
  const ids = new Set<string>()
  for (const message of messages) {
    const id = typeof message.id === 'string' ? message.id.trim() : ''
    if (id) ids.add(id)
  }
  return ids
}

export const createInitialAppState = (): AppState => ({
  status: DEFAULT_STATUS,
  messages: [],
  tasks: [],
  plans: [],
  focuses: [],
  awaitingReply: false,
})

export const isManagerFallbackMessage = (message: ChatMessage): boolean =>
  message.role === 'system' &&
  message.systemEventName === 'manager_fallback_reply'

export const applyIncomingTasks = (
  previous: AppState,
  tasks: TasksSnapshot,
): AppState => ({
  ...previous,
  tasks: tasks.tasks,
})

export const applyIncomingPlans = (
  previous: AppState,
  plans: PlansSnapshot,
): AppState => ({
  ...previous,
  plans: plans.items,
})

export const applyIncomingFocuses = (
  previous: AppState,
  focuses: FocusesSnapshot,
): AppState => ({
  ...previous,
  focuses: focuses.items,
})

export const shouldDisplayMessageTime = (message: ChatMessage): boolean =>
  message.role !== 'system'

const findNewAgentMessages = (
  messages: readonly ChatMessage[],
  previousIds: ReadonlySet<string>,
): ChatMessage[] => {
  const next: ChatMessage[] = []
  for (const message of messages) {
    const id = typeof message.id === 'string' ? message.id.trim() : ''
    if (!id || previousIds.has(id)) continue
    if (message.role === 'agent') next.push(message)
  }
  return next
}

export const applyIncomingSnapshot = (
  previous: AppState,
  snapshot: SnapshotEnvelope,
): { next: AppState; newAgentMessages: ChatMessage[] } => {
  const previousIds = collectMessageIds(previous.messages)
  const incomingMessages = normalizeMessages(snapshot.messages)
  const mode = normalizeMode(snapshot.messages)
  const messages = mergeIncomingMessages({
    mode,
    lastMessages: previous.messages,
    incoming: incomingMessages,
    limit: MESSAGE_LIMIT,
  }) as ChatMessage[]
  const newAgentMessages = findNewAgentMessages(messages, previousIds)
  const shouldStopWaiting =
    newAgentMessages.length > 0 ||
    messages.some((message) => {
      const id = typeof message.id === 'string' ? message.id.trim() : ''
      return id && !previousIds.has(id) && isManagerFallbackMessage(message)
    })

  return {
    next: {
      status: snapshot.status ?? previous.status,
      messages,
      tasks: snapshot.tasks?.tasks ?? previous.tasks,
      plans: snapshot.plans?.items ?? previous.plans,
      focuses: snapshot.focuses?.items ?? previous.focuses,
      awaitingReply: shouldStopWaiting ? false : previous.awaitingReply,
    },
    newAgentMessages,
  }
}
