import {
  GLOBAL_FOCUS_ID,
  enforceFocusCapacity,
  ensureGlobalFocus,
  resolveDefaultFocusId,
  resolveFocusByQuote,
  touchFocus,
} from '../../focus/index.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { cronWakeLoop } from '../../manager/loop-cron.js'
import { idleWakeLoop } from '../../manager/loop-idle.js'
import { managerLoop } from '../../manager/loop.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso } from '../../shared/utils.js'
import { readHistory, appendHistory } from '../../history/store.js'
import { publishUserInput } from '../../streams/queues.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'
import { mergeChatMessages, selectChatMessages } from '../read-model/chat-view.js'

import { toUserInputLogMeta } from './orchestrator-helpers.js'
import { notifyManagerLoop, notifyUiSignal, notifyWorkerLoop } from './signals.js'
import { hydrateRuntimeState, persistRuntimeState } from './runtime-persistence.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { ChatMessage, ChatMessagesMode } from '../read-model/chat-view.js'

const SHUTDOWN_MANAGER_WAIT_POLL_MS = 50

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
  void cronWakeLoop(runtime)
  void idleWakeLoop(runtime)
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
  await bestEffort('persistRuntimeState: stop', () => persistRuntimeState(runtime))
}
