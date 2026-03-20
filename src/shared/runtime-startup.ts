export type RuntimeStartupInfo = {
  startedAt: string
  worktree: string
  commit?: string
  dirty?: boolean
}

export const buildRuntimeStartupLogEntry = (params: {
  runtimeId: string
  startup: RuntimeStartupInfo
}): Record<string, unknown> => ({
  event: 'runtime_startup',
  runtimeId: params.runtimeId,
  startedAt: params.startup.startedAt,
  worktree: params.startup.worktree,
  ...(params.startup.commit ? { commit: params.startup.commit } : {}),
  ...(params.startup.dirty !== undefined
    ? { dirty: params.startup.dirty }
    : {}),
})

export const buildRuntimeStartupSystemEventPayload = (params: {
  runtimeId: string
  startup: RuntimeStartupInfo
}): Record<string, unknown> => ({
  runtime_id: params.runtimeId,
  started_at: params.startup.startedAt,
  worktree: params.startup.worktree,
  ...(params.startup.commit ? { commit: params.startup.commit } : {}),
  ...(params.startup.dirty !== undefined
    ? { dirty: params.startup.dirty }
    : {}),
})
