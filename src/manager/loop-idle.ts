import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/signals.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { selectIdleIntentsForTrigger } from '../orchestrator/read-model/intent-select.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, sleep } from '../shared/utils.js'
import { appendHistory } from '../history/store.js'

import { hasNonIdleManagerInput } from './idle-input.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const IDLE_CHECK_INTERVAL_MS = 1_000
const IDLE_TRIGGER_DELAY_MS = 15 * 60_000

const hasPendingOrRunningTask = (runtime: RuntimeState): boolean =>
  runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )

const isWorkerBusy = (runtime: RuntimeState): boolean =>
  runtime.runningControllers.size > 0 ||
  runtime.workerQueue.size > 0 ||
  hasPendingOrRunningTask(runtime)

const isManagerBusy = (runtime: RuntimeState): boolean =>
  runtime.managerRunning ||
  runtime.managerWakePending ||
  hasNonIdleManagerInput(runtime.inflightInputs)

const markExhaustedIntentsBlocked = (
  runtime: RuntimeState,
  updatedAt: string,
): RuntimeState['idleIntents'] => {
  const changed: RuntimeState['idleIntents'] = []
  for (const intent of runtime.idleIntents) {
    if (intent.status !== 'pending') continue
    if (intent.triggerPolicy.mode !== 'one_shot') continue
    if (intent.attempts < intent.maxAttempts) continue
    intent.status = 'blocked'
    intent.updatedAt = updatedAt
    changed.push(intent)
  }
  return changed
}

const appendIntentBlockedSystemMessage = async (
  runtime: RuntimeState,
  intent: RuntimeState['idleIntents'][number],
  createdAt: string,
): Promise<void> => {
  const label = intent.title.trim() || intent.id
  await appendHistory(runtime.paths.history, {
    id: `sys-intent-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary: `Intent changed: "${label}" (updated).`,
      event: 'intent_updated',
      payload: {
        intent_id: intent.id,
        title: label,
        status: intent.status,
        priority: intent.priority,
        source: intent.source,
        attempts: intent.attempts,
        max_attempts: intent.maxAttempts,
      },
    }),
    createdAt,
    focusId: intent.focusId,
  })
}

export const idleWakeLoop = async (runtime: RuntimeState): Promise<void> => {
  let publishedForCurrentIdleWindow = false
  let lastActivityKey = ''

  while (!runtime.stopped) {
    try {
      const nowMs = Date.now()
      const activityKey = `${runtime.lastManagerActivityAtMs}:${runtime.lastWorkerActivityAtMs}`
      if (activityKey !== lastActivityKey) {
        lastActivityKey = activityKey
        publishedForCurrentIdleWindow = false
      }
      if (publishedForCurrentIdleWindow) {
        await sleep(IDLE_CHECK_INTERVAL_MS)
        continue
      }
      const idleSinceMs = Math.max(
        runtime.lastManagerActivityAtMs,
        runtime.lastWorkerActivityAtMs,
      )
      const idleForMs = nowMs - idleSinceMs
      if (isManagerBusy(runtime) || isWorkerBusy(runtime) || idleForMs < IDLE_TRIGGER_DELAY_MS) {
        await sleep(IDLE_CHECK_INTERVAL_MS)
        continue
      }
      const idleSince = new Date(idleSinceMs).toISOString()
      const triggeredAt = new Date(nowMs).toISOString()
      const exhausted = markExhaustedIntentsBlocked(runtime, triggeredAt)
      for (const intent of exhausted) {
        await bestEffort('appendHistory: intent_auto_blocked', () =>
          appendIntentBlockedSystemMessage(runtime, intent, triggeredAt),
        )
      }
      if (exhausted.length > 0) {
        await bestEffort('persistRuntimeState: intent_exhausted', () =>
          persistRuntimeState(runtime),
        )
      }
      const intentsToTrigger = selectIdleIntentsForTrigger(
        runtime.idleIntents,
        nowMs,
      )
      if (intentsToTrigger.length > 0) {
        for (const intent of intentsToTrigger) {
          intent.triggerState.totalTriggered += 1
          if (intent.triggerPolicy.mode === 'one_shot') intent.attempts += 1
          intent.updatedAt = triggeredAt
          await publishManagerSystemEventInput({
            runtime,
            summary: `Idle intent "${intent.title.trim() || intent.id}" was triggered.`,
            event: 'intent_trigger',
            visibility: 'all',
            payload: {
              intent_id: intent.id,
              title: intent.title,
              prompt: intent.prompt,
              priority: intent.priority,
              source: intent.source,
              attempt: intent.attempts,
              max_attempts: intent.maxAttempts,
              trigger_mode: intent.triggerPolicy.mode,
              cooldown_ms: intent.triggerPolicy.cooldownMs,
              ...(intent.triggerState.lastCompletedAt
                ? { last_completed_at: intent.triggerState.lastCompletedAt }
                : {}),
              triggered_at: triggeredAt,
            },
            createdAt: triggeredAt,
            logEvent: 'intent_trigger_input',
            logMeta: {
              intentId: intent.id,
              attempt: intent.attempts,
              maxAttempts: intent.maxAttempts,
              priority: intent.priority,
              triggerMode: intent.triggerPolicy.mode,
            },
          })
        }
        await bestEffort('persistRuntimeState: intent_trigger', () =>
          persistRuntimeState(runtime),
        )
        publishedForCurrentIdleWindow = true
        notifyManagerLoop(runtime)
        continue
      }
      await publishManagerSystemEventInput({
        runtime,
        summary: 'The system is currently idle.',
        event: 'idle',
        visibility: 'all',
        payload: {
          idle_since: idleSince,
          triggered_at: triggeredAt,
        },
        createdAt: triggeredAt,
        logEvent: 'idle_trigger_input',
        logMeta: {
          idleSince,
          idleForMs,
        },
      })
      publishedForCurrentIdleWindow = true
      notifyManagerLoop(runtime)
    } catch (error) {
      await bestEffort('appendLog: idle_wake_error', () =>
        appendLog(runtime.paths.log, {
          event: 'idle_wake_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(IDLE_CHECK_INTERVAL_MS)
  }
}
