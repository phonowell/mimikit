import { executeCommands } from '../commands/executor.js'
import { parseCommands } from '../commands/parser.js'
import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runTeller } from '../roles/runner.js'
import { sleep } from '../shared/sleep.js'
import { appendHistory, readHistory } from '../storage/history.js'
import {
  markNoticesProcessed,
  readTellerNotices,
} from '../storage/teller-notices.js'
import { upsertUserDraft } from '../storage/user-inputs.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'
import type { TellerNotice } from '../types/teller-notice.js'

type TellerBuffer = {
  inputs: RuntimeState['pendingInputs']
  notices: TellerNotice[]
  noticeIds: Set<string>
  lastInputAt: number
  firstNoticeAt: number
}

const DEFAULT_TELLER_TIMEOUT_MS = 30_000

const createBuffer = (): TellerBuffer => ({
  inputs: [],
  notices: [],
  noticeIds: new Set(),
  lastInputAt: 0,
  firstNoticeAt: 0,
})

const clearBuffer = (buffer: TellerBuffer): void => {
  buffer.inputs = []
  buffer.notices = []
  buffer.noticeIds.clear()
  buffer.lastInputAt = 0
  buffer.firstNoticeAt = 0
}

const appendFallbackReply = async (paths: RuntimeState['paths']) => {
  await appendHistory(paths.history, {
    id: `sys-${Date.now()}`,
    role: 'system',
    text: '系统暂时不可用，请稍后再试。',
    createdAt: nowIso(),
  })
}

const recordInputs = async (
  buffer: TellerBuffer,
  paths: RuntimeState['paths'],
) => {
  if (buffer.inputs.length === 0) return
  const summary = buffer.inputs.map((input) => input.text).join('\n')
  await upsertUserDraft(paths.userInputs, {
    id: buffer.inputs[0]?.id ?? `draft-${Date.now()}`,
    summary,
    createdAt: buffer.inputs[0]?.createdAt ?? nowIso(),
    sourceIds: buffer.inputs.map((input) => input.id),
  })
}

const runTellerBuffer = async (runtime: RuntimeState, buffer: TellerBuffer) => {
  const inputs = buffer.inputs.map((input) => input.text)
  const { notices } = buffer
  const historyLimit = Math.max(0, runtime.config.teller.historyLimit)
  const history = await readHistory(runtime.paths.history)
  const excludeIds = new Set(buffer.inputs.map((input) => input.id))
  const filteredHistory = history.filter((item) => !excludeIds.has(item.id))
  const recentHistory =
    historyLimit > 0
      ? filteredHistory.slice(
          Math.max(0, filteredHistory.length - historyLimit),
        )
      : []
  const startedAt = Date.now()
  try {
    const { model } = runtime.config.teller
    const { modelReasoningEffort } = runtime.config.teller
    await appendLog(runtime.paths.log, {
      event: 'teller_start',
      inputCount: inputs.length,
      noticeCount: notices.length,
      historyCount: recentHistory.length,
      historyLimit,
      inputIds: buffer.inputs.map((input) => input.id),
      noticeIds: [...buffer.noticeIds],
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })
    const result = await runTeller({
      workDir: runtime.config.workDir,
      inputs,
      notices,
      history: recentHistory,
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      timeoutMs: DEFAULT_TELLER_TIMEOUT_MS,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    })
    const parsed = parseCommands(result.output)
    await executeCommands(parsed.commands, {
      paths: runtime.paths,
      inputBuffer: buffer.inputs,
    })
    if (parsed.text) {
      await appendHistory(runtime.paths.history, {
        id: `teller-${Date.now()}`,
        role: 'teller',
        text: parsed.text,
        createdAt: nowIso(),
        elapsedMs: result.elapsedMs,
        ...(result.usage ? { usage: result.usage } : {}),
      })
    }
    if (buffer.noticeIds.size > 0) {
      await markNoticesProcessed(runtime.paths.tellerNotices, [
        ...buffer.noticeIds,
      ])
    }
    runtime.lastTellerReplyAt = Date.now()
    await appendLog(runtime.paths.log, {
      event: 'teller_end',
      status: 'ok',
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.fallbackUsed ? { fallbackUsed: true } : {}),
    })
    clearBuffer(buffer)
  } catch (error) {
    await safe(
      'appendLog: teller_end',
      () =>
        appendLog(runtime.paths.log, {
          event: 'teller_end',
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Math.max(0, Date.now() - startedAt),
        }),
      { fallback: undefined },
    )
    await recordInputs(buffer, runtime.paths)
    await appendFallbackReply(runtime.paths)
    runtime.lastTellerReplyAt = Date.now()
    clearBuffer(buffer)
  }
}

export const tellerLoop = async (runtime: RuntimeState): Promise<void> => {
  const buffer = createBuffer()
  while (!runtime.stopped) {
    const now = Date.now()
    if (runtime.pendingInputs.length > 0) {
      const drained = runtime.pendingInputs.splice(0)
      buffer.inputs.push(...drained)
      buffer.lastInputAt = now
    }

    const notices = await readTellerNotices(runtime.paths.tellerNotices)
    const pending = notices.filter(
      (notice) => !notice.processedByTeller && !buffer.noticeIds.has(notice.id),
    )
    if (pending.length > 0) {
      for (const notice of pending) {
        buffer.notices.push(notice)
        buffer.noticeIds.add(notice.id)
      }
      if (buffer.firstNoticeAt === 0) buffer.firstNoticeAt = now
    }

    const hasInputs = buffer.inputs.length > 0
    const hasNotices = buffer.notices.length > 0
    const debounceReady =
      hasInputs && now - buffer.lastInputAt >= runtime.config.teller.debounceMs
    const noticeReady =
      hasNotices &&
      !hasInputs &&
      now - buffer.firstNoticeAt >= runtime.config.teller.maxNoticeWaitMs

    if ((debounceReady || noticeReady) && (hasInputs || hasNotices))
      await runTellerBuffer(runtime, buffer)

    await sleep(runtime.config.teller.pollMs)
  }
}
