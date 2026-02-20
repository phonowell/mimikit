import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/manager-signal.js'
import { sleep } from '../shared/utils.js'

import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const IDLE_CHECK_INTERVAL_MS = 1_000
const IDLE_TRIGGER_DELAY_MS = 60_000

const hasPendingOrRunningTask = (runtime: RuntimeState): boolean =>
  runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )

const isIdleCandidate = (runtime: RuntimeState): boolean =>
  !runtime.managerRunning &&
  !runtime.managerWakePending &&
  runtime.inflightInputs.length === 0 &&
  runtime.runningControllers.size === 0 &&
  !hasPendingOrRunningTask(runtime)

export const idleWakeLoop = async (runtime: RuntimeState): Promise<void> => {
  let idleSinceMs: number | undefined
  let publishedForCurrentIdleWindow = false

  while (!runtime.stopped) {
    try {
      const nowMs = Date.now()
      if (!isIdleCandidate(runtime)) {
        idleSinceMs = undefined
        publishedForCurrentIdleWindow = false
      } else {
        idleSinceMs ??= nowMs
        const idleForMs = nowMs - idleSinceMs
        if (
          !publishedForCurrentIdleWindow &&
          idleForMs >= IDLE_TRIGGER_DELAY_MS
        ) {
          const idleSince = new Date(idleSinceMs).toISOString()
          const triggeredAt = new Date(nowMs).toISOString()
          await publishManagerSystemEventInput({
            runtime,
            summary: '[系统] 当前处于闲暇状态。',
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
        }
      }
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
