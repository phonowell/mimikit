import { setTimeout as delay } from 'node:timers/promises'

import fastify from 'fastify'
import { expect, vi } from 'vitest'

import { defaultConfig } from '../../src/bootstrap/config.js'
import { registerApiRoutes } from '../../src/surface/http/routes-api.js'
import { createOrchestratorStub } from '../helpers/orchestrator-stub.js'

export type LifecycleRouteStatus = {
  ok: boolean
  runtimeId: string
  agentStatus: 'idle' | 'running'
  activeTasks: number
  pendingTasks: number
  pendingInputs: number
  managerRunning: boolean
  maxWorkers: number
}

export const createLifecycleRouteApp = (params?: {
  workDir?: string
  status?: LifecycleRouteStatus
}) => {
  const app = fastify()
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const stopAndPersist = vi.fn(() => Promise.resolve())
  ;(
    orchestrator as unknown as { stopAndPersist: () => Promise<void> }
  ).stopAndPersist = () => stopAndPersist()
  if (params?.status) {
    ;(
      orchestrator as unknown as { getStatus: () => LifecycleRouteStatus }
    ).getStatus = () => params.status as LifecycleRouteStatus
  }
  const config = defaultConfig({ workDir: params?.workDir ?? '.mimikit' })
  registerApiRoutes(app, orchestrator, config)
  return { app, exitRequests, stopAndPersist }
}

export const expectLifecycleRouteAccepted = async (params: {
  url: '/api/restart' | '/api/reset'
  app: Awaited<ReturnType<typeof createLifecycleRouteApp>>['app']
  stopAndPersist: ReturnType<typeof vi.fn>
  exitRequests: { code: number; reason: string; skipPersist?: boolean }[]
  expectedExitReason: 'http_api_restart' | 'http_api_reset'
  settleMs: number
  useFakeTimers?: boolean
}): Promise<void> => {
  if (params.useFakeTimers) vi.useFakeTimers()
  try {
    const response = await params.app.inject({
      method: 'POST',
      url: params.url,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    if (params.useFakeTimers) await vi.advanceTimersByTimeAsync(params.settleMs)
    else await delay(params.settleMs)
  } finally {
    if (params.useFakeTimers) vi.useRealTimers()
  }
  expect(params.stopAndPersist).toHaveBeenCalledTimes(1)
  expect(params.exitRequests).toEqual([
    { code: 75, reason: params.expectedExitReason, skipPersist: true },
  ])
}

export const expectArchiveMarkdown = (
  response: {
    statusCode: number
    headers: Record<string, unknown>
    body: string
  },
  markers: string[],
): void => {
  expect(response.statusCode).toBe(200)
  expect(String(response.headers['content-type'])).toContain('text/markdown')
  for (const marker of markers) expect(response.body).toContain(marker)
}
