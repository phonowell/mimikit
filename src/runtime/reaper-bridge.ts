type RuntimeChildStarted = {
  id: string
  kind: 'opencode-server'
  pid: number
  meta?: Record<string, unknown>
}

type RuntimeReaperBridge = {
  runtimeId: string
  onRuntimeChildStarted: (child: RuntimeChildStarted) => Promise<void>
  onRuntimeChildStopped: (id: string) => Promise<void>
}

let runtimeReaperBridge: RuntimeReaperBridge | null = null

export const setRuntimeReaperBridge = (
  bridge: RuntimeReaperBridge | null,
): void => {
  runtimeReaperBridge = bridge
}

export const getRuntimeReaperBridge = (
  _unusedRuntimeId?: string,
): RuntimeReaperBridge | null => {
  if (!runtimeReaperBridge) return null
  return runtimeReaperBridge
}
