import type { RuntimeState, UiWakeKind } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000
const MAX_UI_WAKE_EVENTS = 64

type LoopWakeOptions = {
  notifyUi?: boolean
  uiKind?: UiWakeKind
}

type UiSignalRuntime = {
  ui: Pick<
    RuntimeState['ui'],
    'wakeVersion' | 'wakeEvents' | 'signalControllers'
  >
}

type ManagerSignalRuntime = {
  manager: Pick<RuntimeState['manager'], 'wakePending' | 'signalController'>
  ui: UiSignalRuntime['ui']
}

type ManagerWaitRuntime = {
  manager: Pick<RuntimeState['manager'], 'wakePending' | 'signalController'>
}

type WorkerSignalRuntime = {
  worker: Pick<RuntimeState['worker'], 'signalController'>
  ui: UiSignalRuntime['ui']
}

type WorkerWaitRuntime = {
  worker: Pick<RuntimeState['worker'], 'signalController'>
}

const abortController = (controller: AbortController): void => {
  if (!controller.signal.aborted) controller.abort()
}

const replaceOrCreateAbortController = (
  controller?: AbortController,
): AbortController =>
  controller
    ? (abortController(controller), new AbortController())
    : new AbortController()

const waitForSignal = async (params: {
  signal: AbortSignal
  timeoutMs: number
  isResolved?: () => boolean
}): Promise<void> => {
  const { signal, isResolved } = params
  if (signal.aborted || isResolved?.()) return
  const waitMs = Number.isFinite(params.timeoutMs)
    ? Math.min(MAX_WAIT_MS, Math.max(0, params.timeoutMs))
    : MAX_WAIT_MS
  if (waitMs <= 0) return
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, waitMs)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted || isResolved?.()) finish()
  })
}

// --- UI signal ---

const trimUiWakeHistory = (runtime: UiSignalRuntime): void => {
  while (runtime.ui.wakeEvents.size > MAX_UI_WAKE_EVENTS) {
    const oldest = runtime.ui.wakeEvents.keys().next().value as
      | number
      | undefined
    if (oldest === undefined) break
    runtime.ui.wakeEvents.delete(oldest)
  }
}

const resolveNextUiWake = (
  runtime: UiSignalRuntime,
  sinceVersion: number,
): { kind: UiWakeKind; version: number } | undefined => {
  const normalizedVersion =
    Number.isFinite(sinceVersion) && sinceVersion > 0
      ? Math.floor(sinceVersion)
      : 0
  for (const [version, kind] of runtime.ui.wakeEvents)
    if (version > normalizedVersion) return { kind, version }

  return undefined
}

export const notifyUiSignal = (
  runtime: UiSignalRuntime,
  kind: UiWakeKind = 'snapshot',
): void => {
  runtime.ui.wakeVersion += 1
  runtime.ui.wakeEvents.set(runtime.ui.wakeVersion, kind)
  trimUiWakeHistory(runtime)
  for (const controller of runtime.ui.signalControllers)
    abortController(controller)
}

const notifyUiIfRequested = (
  runtime: UiSignalRuntime,
  options: LoopWakeOptions | undefined,
): void => {
  if (options?.notifyUi === false) return
  notifyUiSignal(runtime, options?.uiKind ?? 'snapshot')
}

export const waitForUiSignal = async (
  runtime: UiSignalRuntime,
  timeoutMs: number,
  sinceVersion = 0,
): Promise<{ kind: UiWakeKind | 'timeout'; version: number }> => {
  const normalizedSinceVersion =
    Number.isFinite(sinceVersion) && sinceVersion > 0
      ? Math.floor(sinceVersion)
      : 0
  const pending = resolveNextUiWake(runtime, normalizedSinceVersion)
  if (pending) return pending
  const controller = new AbortController()
  runtime.ui.signalControllers.add(controller)
  try {
    await waitForSignal({
      signal: controller.signal,
      timeoutMs,
      isResolved: () => runtime.ui.wakeVersion > normalizedSinceVersion,
    })
    return (
      resolveNextUiWake(runtime, normalizedSinceVersion) ?? {
        kind: 'timeout',
        version: normalizedSinceVersion,
      }
    )
  } finally {
    runtime.ui.signalControllers.delete(controller)
  }
}

// --- Manager signal ---

export const notifyManagerLoop = (
  runtime: ManagerSignalRuntime,
  options?: LoopWakeOptions,
): void => {
  runtime.manager.wakePending = true
  abortController(runtime.manager.signalController)
  notifyUiIfRequested(runtime, options)
}

export const waitForManagerLoopSignal = async (
  runtime: ManagerWaitRuntime,
  timeoutMs: number,
): Promise<void> => {
  if (runtime.manager.wakePending) {
    runtime.manager.wakePending = false
    return
  }
  const controller = new AbortController()
  runtime.manager.signalController = controller
  await waitForSignal({
    signal: controller.signal,
    timeoutMs,
    isResolved: () => runtime.manager.wakePending,
  })
  runtime.manager.wakePending = false
}

// --- Worker signal ---

export const notifyWorkerLoop = (
  runtime: WorkerSignalRuntime,
  options?: LoopWakeOptions,
): void => {
  runtime.worker.signalController = replaceOrCreateAbortController(
    runtime.worker.signalController,
  )
  notifyUiIfRequested(runtime, options)
}

export const waitForWorkerLoopSignal = (
  runtime: WorkerWaitRuntime,
  timeoutMs: number,
): Promise<void> =>
  waitForSignal({
    signal: runtime.worker.signalController.signal,
    timeoutMs,
  })
