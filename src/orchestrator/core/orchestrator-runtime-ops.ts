import {
  enforceFocusCapacity,
  ensureGlobalFocus,
  GLOBAL_FOCUS_ID,
  resolveDefaultFocusId,
  resolveFocusByQuote,
  touchFocus,
} from '../../focus/index.js'
import {
  appendHistory,
  readHistory,
  rewriteHistory,
} from '../../history/store.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { triggerWakeLoop } from '../../manager/loop-trigger.js'
import { managerLoop } from '../../manager/loop.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso } from '../../shared/utils.js'
import { publishUserInput } from '../../streams/queues.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'
import {
  mergeChatMessages,
  selectChatMessages,
} from '../read-model/chat-view.js'

import { toUserInputLogMeta } from './orchestrator-helpers.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from './runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
} from './signals.js'
import {
  cancelPendingUserChoiceByUserInput,
  selectPendingUserChoice,
} from './user-choice.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { ChatMessage, ChatMessagesMode } from '../read-model/chat-view.js'
import type { SelectPendingUserChoiceResult } from './user-choice.js'

const SHUTDOWN_MANAGER_WAIT_POLL_MS = 50
const DELETED_MESSAGE_TEXT = 'Message deleted.'

export type DeleteChatMessageResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_found' | 'not_allowed' }

export const addUserInput = async (
  runtime: RuntimeState,
  text: string,
  meta?: UserMeta,
  quote?: string,
): Promise<string> => {
  const id = `input-${newId()}`
  const createdAt = nowIso()
  const quoteId = quote?.trim()
  const inherited = quoteId
    ? await resolveFocusByQuote(runtime, quoteId)
    : undefined
  const focusId = inherited ?? resolveDefaultFocusId(runtime)
  touchFocus(runtime, focusId)
  const baseInput = { id, role: 'user' as const, text, createdAt, focusId }
  const input = quoteId ? { ...baseInput, quote: quoteId } : baseInput
  await publishUserInput({ paths: runtime.paths, payload: input })
  runtime.inflightInputs.push(input)
  notifyUiSignal(runtime)
  if (meta) runtime.lastUserMeta = meta
  await appendLog(runtime.paths.log, {
    event: 'user_input',
    id,
    focusId,
    ...(quoteId ? { quote: quoteId } : {}),
    ...toUserInputLogMeta(meta),
  })
  await cancelPendingUserChoiceByUserInput({
    runtime,
    triggerInputId: id,
    createdAt,
  })
  notifyManagerLoop(runtime)
  return id
}

export const getChatMessages = async (
  runtime: RuntimeState,
  limit = 50,
  afterId?: string,
): Promise<{ messages: ChatMessage[]; mode: ChatMessagesMode }> => {
  const history = await readHistory(runtime.paths.history)
  return selectChatMessages({
    history,
    inflightInputs: [...runtime.inflightInputs],
    limit,
    ...(afterId ? { afterId } : {}),
  })
}

export const deleteChatMessage = async (
  runtime: RuntimeState,
  messageId: string,
): Promise<DeleteChatMessageResult> => {
  const id = messageId.trim()
  if (!id) return { ok: false, reason: 'not_found' }

  const history = await readHistory(runtime.paths.history)
  const targetIndex = history.findIndex((message) => message.id === id)
  if (targetIndex < 0) return { ok: false, reason: 'not_found' }

  const target = history[targetIndex]
  if (!target) return { ok: false, reason: 'not_found' }
  if (target.role === 'system') return { ok: false, reason: 'not_allowed' }

  const nextHistory = [...history]
  nextHistory[targetIndex] = {
    id: target.id,
    role: 'system' as const,
    visibility: 'user' as const,
    text: DELETED_MESSAGE_TEXT,
    createdAt: target.createdAt,
    focusId: target.focusId,
  }

  await rewriteHistory(runtime.paths.history, nextHistory)
  await appendLog(runtime.paths.log, {
    event: 'message_deleted',
    id,
    role: target.role,
  })
  notifyUiSignal(runtime, 'messages')
  return { ok: true, id }
}

export const selectPendingUserChoiceFromUser = async (
  runtime: RuntimeState,
  choiceId: string,
  optionId: string,
): Promise<SelectPendingUserChoiceResult> => {
  const result = await selectPendingUserChoice({
    runtime,
    choiceId,
    optionId,
    source: 'user',
  })
  if (!result.ok) {
    if (result.reason === 'expired') {
      notifyUiSignal(runtime)
      notifyManagerLoop(runtime)
    }
    return result
  }
  notifyUiSignal(runtime)
  notifyManagerLoop(runtime)
  return result
}

export const getChatHistory = async (
  runtime: RuntimeState,
  limit = 50,
): Promise<ChatMessage[]> => {
  const history = await readHistory(runtime.paths.history)
  return mergeChatMessages({
    history,
    inflightInputs: [...runtime.inflightInputs],
    limit,
  })
}

export const startOrchestratorRuntime = async (
  runtime: RuntimeState,
): Promise<void> => {
  await hydrateRuntimeState(runtime)
  ensureGlobalFocus(runtime)
  enforceFocusCapacity(runtime)
  const startedAt = nowIso()
  await bestEffort('appendHistory: startup_system_message', () =>
    appendHistory(runtime.paths.history, {
      id: `sys-startup-${newId()}`,
      role: 'system',
      visibility: 'user',
      text: formatSystemEventText({
        summary: 'Session started.',
        event: 'startup',
        payload: {
          runtime_id: runtime.runtimeId,
          started_at: startedAt,
        },
      }),
      createdAt: startedAt,
      focusId: GLOBAL_FOCUS_ID,
    }),
  )
  enqueuePendingWorkerTasks(runtime)
  notifyWorkerLoop(runtime)
  void managerLoop(runtime)
  void triggerWakeLoop(runtime)
  void workerLoop(runtime)
}

export const prepareStop = (runtime: RuntimeState): void => {
  runtime.stopped = true
  notifyManagerLoop(runtime)
  notifyWorkerLoop(runtime)
}

export const waitForManagerDrain = async (
  runtime: RuntimeState,
): Promise<void> => {
  while (runtime.managerRunning) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, SHUTDOWN_MANAGER_WAIT_POLL_MS),
    )
  }
}

export const persistStopSnapshot = async (
  runtime: RuntimeState,
): Promise<void> => {
  await bestEffort('persistRuntimeState: stop', () =>
    persistRuntimeState(runtime),
  )
}
