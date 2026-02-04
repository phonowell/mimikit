import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runLocal } from '../roles/runner.js'
import { appendHistory, readHistory } from '../storage/history.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'
import type { HistoryMessage } from '../types/history.js'

const selectRecentHistory = (
  history: HistoryMessage[],
  params: {
    excludeIds?: Set<string>
    minCount: number
    maxCount: number
    maxBytes: number
  },
): HistoryMessage[] => {
  const { excludeIds } = params
  const filtered = excludeIds
    ? history.filter((item) => !excludeIds.has(item.id))
    : history
  const historyMin = Math.max(0, params.minCount)
  const historyMax = Math.max(historyMin, params.maxCount)
  const historyMaxBytes = Math.max(0, params.maxBytes)
  const recent: HistoryMessage[] = []
  let totalBytes = 0
  for (let i = filtered.length - 1; i >= 0; i -= 1) {
    const item = filtered[i]
    if (!item) continue
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
    totalBytes += itemBytes
    recent.push(item)
    if (recent.length >= historyMax) break
    if (historyMaxBytes > 0 && totalBytes > historyMaxBytes)
      if (recent.length >= historyMin) break
  }
  recent.reverse()
  return recent
}

export const runLocalQuickReply = async (
  runtime: RuntimeState,
  params: {
    id: string
    text: string
  },
): Promise<void> => {
  const startedAt = Date.now()
  const { config } = runtime
  const { model, baseUrl, timeoutMs } = config.local
  await safe(
    'appendLog: local_start',
    () =>
      appendLog(runtime.paths.log, {
        event: 'local_start',
        inputId: params.id,
        inputChars: params.text.length,
        ...(model ? { model } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        timeoutMs,
      }),
    { fallback: undefined },
  )
  try {
    const history = await readHistory(runtime.paths.history)
    const recentHistory = selectRecentHistory(history, {
      excludeIds: new Set([params.id]),
      minCount: config.manager.historyMinCount,
      maxCount: config.manager.historyMaxCount,
      maxBytes: config.manager.historyMaxBytes,
    })
    const result = await runLocal({
      stateDir: config.stateDir,
      workDir: config.workDir,
      input: params.text,
      history: recentHistory,
      ...(runtime.lastUserMeta
        ? { env: { lastUser: runtime.lastUserMeta } }
        : {}),
      timeoutMs,
      model,
      baseUrl,
    })
    const output = result.output.trim()
    if (output) {
      await appendHistory(runtime.paths.history, {
        id: `local-${Date.now()}`,
        role: 'manager',
        text: output,
        createdAt: nowIso(),
        elapsedMs: result.elapsedMs,
        ...(result.usage ? { usage: result.usage } : {}),
      })
    }
    await appendLog(runtime.paths.log, {
      event: 'local_end',
      status: 'ok',
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
    })
  } catch (error) {
    await safe(
      'appendLog: local_end',
      () =>
        appendLog(runtime.paths.log, {
          event: 'local_end',
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Math.max(0, Date.now() - startedAt),
        }),
      { fallback: undefined },
    )
  }
}
