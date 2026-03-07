type RuntimeChildStarted = {
  id: string
  kind: 'opencode-server'
  pid: number
  meta?: Record<string, unknown>
}

type RuntimeReaperBridge = {
  onRuntimeChildStarted: (child: RuntimeChildStarted) => Promise<void>
  onRuntimeChildStopped: (id: string) => Promise<void>
}

let runtimeReaperBridge: RuntimeReaperBridge | null = null

export const setRuntimeReaperBridge = (
  bridge: RuntimeReaperBridge | null,
): void => {
  runtimeReaperBridge = bridge
}

export const getRuntimeReaperBridge = (): RuntimeReaperBridge | null => {
  if (!runtimeReaperBridge) return null
  return runtimeReaperBridge
}
