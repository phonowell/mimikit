import type { RuntimeLock } from '../cli/runtime-lock.js'
import type { StatePaths } from '../fs/paths.js'

export type WorkerKind = 'opencode-server'

export type LeaseRecord = {
  runtimeId: string
  ownerPid: number
  updatedAtMs: number
  updatedAt: string
}

export type ChildRecord = {
  id: string
  runtimeId: string
  ownerPid: number
  kind: WorkerKind
  pid: number
  createdAt: string
  meta?: Record<string, unknown>
}

export type ChildrenRegistry = {
  items: ChildRecord[]
}

export type RuntimeReaperHandle = {
  startHeartbeat: () => Promise<void>
  stopHeartbeat: () => Promise<void>
  registerChild: (params: {
    id: string
    kind: WorkerKind
    pid: number
    meta?: Record<string, unknown>
  }) => Promise<void>
  unregisterChild: (id: string) => Promise<void>
}

export type CreateRuntimeReaperHandleParams = {
  runtimeId: string
  paths: StatePaths
  runtimeLock: RuntimeLock
  logPath?: string
}
