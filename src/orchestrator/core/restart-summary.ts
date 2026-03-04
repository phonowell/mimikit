import { appendHistory, readHistory } from '../../history/store.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso } from '../../shared/utils.js'
import {
  markPendingRestartSummaryConsumed,
  readPendingRestartSummary,
  upsertPendingRestartSummary,
} from '../../storage/pending-restart-summary.js'
import {
  buildConversationSummaryForReset,
  type RestartSummaryContext,
} from './restart-summary-build.js'

import type { FocusId } from '../../types/index.js'
const SUMMARY_RESTORED_EVENT = 'session_summary_restored'
export { buildConversationSummaryForReset } from './restart-summary-build.js'

const hasSummaryRestoreMarker = (text: string, summaryId: string): boolean =>
  text.includes(`<M:system_event name="${SUMMARY_RESTORED_EVENT}"`) &&
  text.includes(`"summary_id":"${summaryId}"`)

export const stagePendingRestartSummary = async (params: {
  stateDir: string
  runtimeId: string
} & RestartSummaryContext): Promise<void> => {
  const summary = buildConversationSummaryForReset(params)
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
