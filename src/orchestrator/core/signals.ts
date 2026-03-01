import type { RuntimeState, UiWakeKind } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000
const MAX_UI_WAKE_EVENTS = 64

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

const trimUiWakeHistory = (runtime: RuntimeState): void => {
  while (runtime.uiWakeEvents.size > MAX_UI_WAKE_EVENTS) {
    const oldest = runtime.uiWakeEvents.keys().next().value as number | undefined
    if (oldest === undefined) break
    runtime.uiWakeEvents.delete(oldest)
  }
}

const resolveNextUiWake = (
  runtime: RuntimeState,
  sinceVersion: number,
): { kind: UiWakeKind; version: number } | undefined => {
  const normalizedVersion =
    Number.isFinite(sinceVersion) && sinceVersion > 0
      ? Math.floor(sinceVersion)
      : 0
  for (const [version, kind] of runtime.uiWakeEvents) {
    if (version > normalizedVersion) return { kind, version }
  }
  return undefined
}

export const notifyUiSignal = (
  runtime: RuntimeState,
  kind: UiWakeKind = 'snapshot',
): void => {
  runtime.uiWakeVersion += 1
  runtime.uiWakeEvents.set(runtime.uiWakeVersion, kind)
  trimUiWakeHistory(runtime)
  for (const controller of runtime.uiSignalControllers) {
    abortController(controller)
  }
}

export const waitForUiSignal = async (
  runtime: RuntimeState,
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
  runtime.uiSignalControllers.add(controller)
  try {
    await waitForSignal({
      signal: controller.signal,
      timeoutMs,
      isResolved: () => runtime.uiWakeVersion > normalizedSinceVersion,
    })
    return (
      resolveNextUiWake(runtime, normalizedSinceVersion) ?? {
        kind: 'timeout',
        version: normalizedSinceVersion,
      }
    )
  } finally {
    runtime.uiSignalControllers.delete(controller)
  }
}

// --- Manager signal ---

export const notifyManagerLoop = (runtime: RuntimeState): void => {
  runtime.managerWakePending = true
  abortController(runtime.managerSignalController)
  notifyUiSignal(runtime)
}

export const waitForManagerLoopSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  if (runtime.managerWakePending) {
    runtime.managerWakePending = false
    return
  }
  const controller = new AbortController()
  runtime.managerSignalController = controller
  await waitForSignal({
    signal: controller.signal,
    timeoutMs,
    isResolved: () => runtime.managerWakePending,
  })
  runtime.managerWakePending = false
}

// --- Worker signal ---

export const notifyWorkerLoop = (runtime: RuntimeState): void => {
  runtime.workerSignalController = replaceOrCreateAbortController(
    runtime.workerSignalController,
  )
  notifyUiSignal(runtime)
}

export const waitForWorkerLoopSignal = (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> =>
  waitForSignal({
    signal: runtime.workerSignalController.signal,
    timeoutMs,
  })
