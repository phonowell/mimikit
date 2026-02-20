import { abortController, waitForSignal } from './signal-primitives.js'

import type { RuntimeState, UiWakeKind } from './runtime-state.js'

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
