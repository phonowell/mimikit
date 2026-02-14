import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/manager-signal.js'

import { checkCronJobs } from './loop-cron.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const CRON_TICK_MS = 1_000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const cronWakeLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    try {
      const triggered = await checkCronJobs(runtime)
      if (triggered > 0) notifyManagerLoop(runtime)
    } catch (error) {
      await bestEffort('appendLog: cron_wake_error', () =>
        appendLog(runtime.paths.log, {
          event: 'cron_wake_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(CRON_TICK_MS)
  }
}
