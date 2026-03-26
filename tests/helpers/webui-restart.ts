import { vi } from 'vitest'

type RestartWindow = typeof window

export const createJsonResponse = (
  ok: boolean,
  status: number,
  payload: unknown,
) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(payload),
})

export const installRestartWindow = (): RestartWindow => {
  const nextWindow: typeof window = {
    setTimeout,
    clearTimeout,
    location: { reload: vi.fn() },
  }
  globalThis.window = nextWindow
  return nextWindow
}

export const createStatusResponse = (
  runtimeId: string,
  overrides?: {
    managerRunning?: boolean
    activeTasks?: number
    pendingTasks?: number
    pendingInputs?: number
  },
) =>
  createJsonResponse(true, 200, {
    runtimeId,
    managerRunning: overrides?.managerRunning ?? false,
    activeTasks: overrides?.activeTasks ?? 0,
    pendingTasks: overrides?.pendingTasks ?? 0,
    pendingInputs: overrides?.pendingInputs ?? 0,
  })
