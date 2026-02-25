import type { RuntimeState, UiWakeKind } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000

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

const consumeUiWake = (runtime: RuntimeState): UiWakeKind | undefined => {
  if (!runtime.uiWakePending) return undefined
  runtime.uiWakePending = false
  const kind = runtime.uiWakeKind === 'stream' ? 'stream' : 'snapshot'
  runtime.uiWakeKind = null
  return kind
}

const mergeUiWakeKind = (
  current: UiWakeKind | null,
  next: UiWakeKind,
): UiWakeKind => {
  if (current === 'snapshot' || next === 'snapshot') return 'snapshot'
  return 'stream'
}

export const notifyUiSignal = (
  runtime: RuntimeState,
  kind: UiWakeKind = 'snapshot',
): void => {
  runtime.uiWakeKind = mergeUiWakeKind(
    runtime.uiWakePending ? runtime.uiWakeKind : null,
    kind,
  )
  runtime.uiWakePending = true
  runtime.uiSignalController ??= new AbortController()
  abortController(runtime.uiSignalController)
}

export const waitForUiSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<UiWakeKind | 'timeout'> => {
  const pending = consumeUiWake(runtime)
  if (pending) return pending
  const controller = new AbortController()
  runtime.uiSignalController = controller
  await waitForSignal({
    signal: controller.signal,
    timeoutMs,
    isResolved: () => runtime.uiWakePending,
  })
  return consumeUiWake(runtime) ?? 'timeout'
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
