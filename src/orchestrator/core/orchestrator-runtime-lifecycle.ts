import {
  enforceActiveFocusLimit,
  ensureGlobalFocus,
  pruneArchivedFocuses,
} from '../../focus/index.js'
import { managerLoop } from '../../manager/loop.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'

import { appendStartupSystemMessage } from './orchestrator-input-ingress.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from './runtime-persistence.js'
import { notifyManagerLoop, notifyWorkerLoop } from './signals.js'

import type { RuntimeState } from './runtime-state.js'

const SHUTDOWN_MANAGER_WAIT_POLL_MS = 50

export const startRuntimeLifecycle = async (
  runtime: RuntimeState,
): Promise<void> => {
  await hydrateRuntimeState(runtime)
  ensureGlobalFocus(runtime)
  await enforceActiveFocusLimit(runtime)
  await pruneArchivedFocuses(runtime)
  await appendStartupSystemMessage(runtime)
  enqueuePendingWorkerTasks(runtime)
  notifyWorkerLoop(runtime)
  void managerLoop(runtime)
  void workerLoop(runtime)
}

export const prepareRuntimeStop = (runtime: RuntimeState): void => {
  runtime.session.stopped = true
  if (!runtime.manager.runAbortController.signal.aborted)
    runtime.manager.runAbortController.abort()
  notifyManagerLoop(runtime)
  notifyWorkerLoop(runtime)
}

export const waitForRuntimeManagerDrain = async (
  runtime: RuntimeState,
): Promise<void> => {
  while (runtime.manager.running) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, SHUTDOWN_MANAGER_WAIT_POLL_MS),
    )
  }
}

export const persistRuntimeSnapshotOnStop = async (
  runtime: RuntimeState,
): Promise<void> => {
  const { bestEffort } = await import('../../log/safe.js')
  await bestEffort('persistRuntimeState: stop', () =>
    persistRuntimeState(runtime),
  )
}
