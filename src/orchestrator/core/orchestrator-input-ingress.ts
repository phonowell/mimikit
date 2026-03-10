import {
  GLOBAL_FOCUS_ID,
  resolveDefaultFocusId,
  resolveFocusByQuote,
  touchFocus,
} from '../../focus/index.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { newId, nowIso } from '../../shared/utils.js'
import { publishUserInput } from '../../streams/queues.js'

import {
  broadcastUserMessage,
  rememberChannelTargets,
} from './channel-broadcast.js'
import { toUserInputLogMeta } from './orchestrator-helpers.js'
import { notifyManagerLoop, notifyUiSignal } from './signals.js'
import { cancelPendingUserChoiceByUserInput } from './user-choice.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

export const appendUserInput = async (
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
  const source = meta?.source?.trim()
  const platform = meta?.platform?.trim()
  const telegramChatId = meta?.telegramChatId?.trim()
  const telegramMessageId = meta?.telegramMessageId?.trim()
  const telegramUpdateId = meta?.telegramUpdateId?.trim()
  const telegramTimestamp = meta?.telegramTimestamp?.trim()
  const feishuChatId = meta?.feishuChatId?.trim()
  const feishuMessageId = meta?.feishuMessageId?.trim()
  const feishuEventId = meta?.feishuEventId?.trim()
  const feishuTimestamp = meta?.feishuTimestamp?.trim()
  const baseInput = {
    id,
    role: 'user' as const,
    text,
    createdAt,
    focusId,
    ...(source ? { source } : {}),
    ...(platform ? { platform } : {}),
    ...(telegramChatId ? { telegramChatId } : {}),
    ...(telegramMessageId ? { telegramMessageId } : {}),
    ...(telegramUpdateId ? { telegramUpdateId } : {}),
    ...(telegramTimestamp ? { telegramTimestamp } : {}),
    ...(feishuChatId ? { feishuChatId } : {}),
    ...(feishuMessageId ? { feishuMessageId } : {}),
    ...(feishuEventId ? { feishuEventId } : {}),
    ...(feishuTimestamp ? { feishuTimestamp } : {}),
  }
  const input = quoteId ? { ...baseInput, quote: quoteId } : baseInput
  await publishUserInput({ paths: runtime.paths, payload: input })
  runtime.session.inflightInputs.push(input)
  notifyUiSignal(runtime)
  if (meta) {
    runtime.session.lastUserMeta = meta
    rememberChannelTargets(runtime, meta)
  }
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
  await bestEffort('broadcast:user_message', () =>
    broadcastUserMessage({
      runtime,
      input,
    }),
  )
  notifyManagerLoop(runtime)
  return id
}

export const appendStartupSystemMessage = async (
  runtime: RuntimeState,
): Promise<void> => {
  const { appendHistory } = await import('../../history/store.js')
  const { bestEffort } = await import('../../log/safe.js')
  const { createSystemEventRecord } =
    await import('../../shared/system-event.js')
  const startedAt = nowIso()
  const eventRecord = createSystemEventRecord({
    summary: 'Session started.',
    event: 'startup',
    payload: {
      runtime_id: runtime.runtimeId,
      started_at: startedAt,
    },
  })
  await bestEffort('appendHistory: startup_system_message', () =>
    appendHistory(runtime.paths.history, {
      id: `sys-startup-${newId()}`,
      role: 'system',
      visibility: 'user',
      ...eventRecord,
      createdAt: startedAt,
      focusId: GLOBAL_FOCUS_ID,
    }),
  )
}
