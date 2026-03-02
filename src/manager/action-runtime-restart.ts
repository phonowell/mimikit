import { bestEffort } from '../log/safe.js'

import { restartSchema } from './action-apply-schema.js'
import {
  notifyWorkerLoop,
  persistRuntimeState,
  type RuntimeState,
} from './runtime-adapter.js'

import type { Parsed } from '../actions/model/spec.js'

const requestManagerRestart = (runtime: RuntimeState): void => {
  setTimeout(() => {
    runtime.stopped = true
    notifyWorkerLoop(runtime)
    runtime.requestExit?.({
      code: 75,
      reason: 'manager_restart',
    })
    void bestEffort('persistRuntimeState: manager_restart', () =>
      persistRuntimeState(runtime),
    )
  }, 100)
}

export const applyRestartRuntimeAction = (
  runtime: RuntimeState,
  item: Parsed,
): Promise<boolean> => {
  const parsed = restartSchema.safeParse(item.attrs)
  if (!parsed.success) return Promise.resolve(false)
  requestManagerRestart(runtime)
  return Promise.resolve(true)
}
