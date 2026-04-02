import {
  enqueuePendingWorkerTasks,
  workerLoop,
} from '../../execution/worker/dispatch.js'
import { managerLoop } from '../../policy/manager/loop.js'
import { appendStartupSystemMessage } from '../../surface/orchestrator/orchestrator-input-ingress.js'
import {
  enforceActiveFocusLimit,
  ensureGlobalFocus,
  pruneArchivedFocuses,
} from '../../work/focus/index.js'

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
  runtime.process.session.stopped = true
  if (!runtime.process.manager.runAbortController.signal.aborted)
    runtime.process.manager.runAbortController.abort()
  notifyManagerLoop(runtime)
  notifyWorkerLoop(runtime)
}

export const waitForRuntimeManagerDrain = async (
  runtime: RuntimeState,
): Promise<void> => {
  while (runtime.process.manager.running) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, SHUTDOWN_MANAGER_WAIT_POLL_MS),
    )
  }
}

export const persistRuntimeSnapshotOnStop = async (
  runtime: RuntimeState,
): Promise<void> => {
  const { bestEffort } = await import('../../persistence/log/safe.js')
  await bestEffort('persistRuntimeState: stop', () =>
    persistRuntimeState(runtime),
  )
}
