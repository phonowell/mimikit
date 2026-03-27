import { newId, nowIso } from '../../foundation/shared/utils.js'
import {
  broadcastUserMessage,
  rememberChannelTargets,
} from '../../kernel/orchestrator/channel-broadcast.js'
import { toUserInputLogMeta } from '../../kernel/orchestrator/orchestrator-helpers.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
} from '../../kernel/orchestrator/signals.js'
import { buildRuntimeStartupSystemEventPayload } from '../../kernel/shared/runtime-startup.js'
import { publishUserInput } from '../../kernel/streams/queues.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  GLOBAL_FOCUS_ID,
  resolveDefaultFocusId,
  resolveFocusByQuote,
  touchFocus,
} from '../../work/focus/index.js'

import type {
  RuntimeUserMeta,
  SurfaceRuntime,
} from '../../kernel/orchestrator/runtime-interfaces.js'

export const appendUserInput = async (
  runtime: SurfaceRuntime,
  text: string,
  meta?: RuntimeUserMeta,
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
  runtime: SurfaceRuntime,
): Promise<void> => {
  const { appendHistory } = await import('../../persistence/history/store.js')
  const { bestEffort } = await import('../../persistence/log/safe.js')
  const { createSystemEventRecord } = await import('../shared/system-event.js')
  const eventRecord = createSystemEventRecord({
    summary: 'Session started.',
    event: 'startup',
    payload: buildRuntimeStartupSystemEventPayload({
      runtimeId: runtime.runtimeId,
      startup: runtime.startup,
    }),
  })
  await bestEffort('appendHistory: startup_system_message', () =>
    appendHistory(runtime.paths.history, {
      id: `sys-startup-${newId()}`,
      role: 'system',
      visibility: 'user',
      ...eventRecord,
      createdAt: runtime.startup.startedAt,
      focusId: GLOBAL_FOCUS_ID,
    }),
  )
}
