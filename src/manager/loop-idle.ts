import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/manager-signal.js'
import { sleep } from '../shared/utils.js'

import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const IDLE_CHECK_INTERVAL_MS = 1_000
const IDLE_TRIGGER_DELAY_MS = 15 * 60_000

const hasPendingOrRunningTask = (runtime: RuntimeState): boolean =>
  runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )

const isIdleSystemInput = (
  input: RuntimeState['inflightInputs'][number],
): boolean => input.role === 'system' && input.text.includes('name="idle"')

const hasNonIdleInflightInputs = (runtime: RuntimeState): boolean =>
  runtime.inflightInputs.some((input) => !isIdleSystemInput(input))

const isWorkerBusy = (runtime: RuntimeState): boolean =>
  runtime.runningControllers.size > 0 ||
  runtime.workerQueue.size > 0 ||
  hasPendingOrRunningTask(runtime)

const isManagerBusy = (runtime: RuntimeState): boolean =>
  runtime.managerRunning ||
  runtime.managerWakePending ||
  hasNonIdleInflightInputs(runtime)

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
      if (isManagerBusy(runtime) || isWorkerBusy(runtime)) {
        await sleep(IDLE_CHECK_INTERVAL_MS)
        continue
      }
      const idleSinceMs = Math.max(
        runtime.lastManagerActivityAtMs,
        runtime.lastWorkerActivityAtMs,
      )
      const idleForMs = nowMs - idleSinceMs
      if (idleForMs < IDLE_TRIGGER_DELAY_MS) {
        await sleep(IDLE_CHECK_INTERVAL_MS)
        continue
      }
      const idleSince = new Date(idleSinceMs).toISOString()
      const triggeredAt = new Date(nowMs).toISOString()
      await publishManagerSystemEventInput({
        runtime,
        summary: '当前处于闲暇状态。',
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
