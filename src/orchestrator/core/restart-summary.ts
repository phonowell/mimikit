import { appendHistory, readHistory } from '../../history/store.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { truncateText } from '../../shared/text.js'
import { newId, nowIso } from '../../shared/utils.js'
import {
  markPendingRestartSummaryConsumed,
  readPendingRestartSummary,
  upsertPendingRestartSummary,
} from '../../storage/pending-restart-summary.js'

import type { ChatMessage } from '../read-model/chat-view.js'
import type { FocusId } from '../../types/index.js'

const MAX_SUMMARY_ITEMS = 10
const MAX_SUMMARY_ITEM_CHARS = 220
const SUMMARY_RESTORED_EVENT = 'session_summary_restored'

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
  const scoped = candidates.slice(Math.max(0, candidates.length - MAX_SUMMARY_ITEMS))
  return scoped.map(
    (item) =>
      `- ${item.role}: ${truncateText(item.text, MAX_SUMMARY_ITEM_CHARS, { normalizeWhitespace: true })}`,
  )
}

export const buildConversationSummaryForReset = (
  messages: ChatMessage[],
): string => {
  const lines = toSummaryLines(messages)
  if (lines.length === 0)
    return 'No prior conversation content was available before reset.'
  return `Conversation highlights before reset:\n${lines.join('\n')}`
}

const hasSummaryRestoreMarker = (text: string, summaryId: string): boolean =>
  text.includes(`<M:system_event name="${SUMMARY_RESTORED_EVENT}"`) &&
  text.includes(`"summary_id":"${summaryId}"`)

export const stagePendingRestartSummary = async (params: {
  stateDir: string
  runtimeId: string
  messages: ChatMessage[]
}): Promise<void> => {
  const summary = buildConversationSummaryForReset(params.messages)
  await upsertPendingRestartSummary({
    stateDir: params.stateDir,
    summary,
    sourceRuntimeId: params.runtimeId,
  })
}

export const injectPendingRestartSummary = async (params: {
  stateDir: string
  historyDir: string
  runtimeId: string
  focusId: FocusId
}): Promise<void> => {
  const pending = await readPendingRestartSummary(params.stateDir)
  if (!pending || pending.consumed) return

  const history = await readHistory(params.historyDir)
  const alreadyInjected = history.some(
    (message) =>
      message.role === 'system' &&
      hasSummaryRestoreMarker(message.text, pending.id),
  )
  if (alreadyInjected) {
    await markPendingRestartSummaryConsumed({
      stateDir: params.stateDir,
      id: pending.id,
    })
    return
  }

  const createdAt = nowIso()
  const id = `sys-summary-restore-${newId()}`
  const summaryText = [
    'Session context restored from the previous runtime.',
    '',
    pending.summary,
  ].join('\n')
  const payload = {
    summary_id: pending.id,
    source_runtime_id: pending.sourceRuntimeId,
    restored_runtime_id: params.runtimeId,
    restored_at: createdAt,
  }

  await appendHistory(params.historyDir, {
    id,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary: summaryText,
      event: SUMMARY_RESTORED_EVENT,
      payload,
    }),
    createdAt,
    focusId: params.focusId,
  })
  await markPendingRestartSummaryConsumed({
    stateDir: params.stateDir,
    id: pending.id,
    injectedMessageId: id,
  })
}
