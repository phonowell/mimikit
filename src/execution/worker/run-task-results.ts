import { readLogDiagnostics } from '../../persistence/log/diagnostics.js'

import { buildResult } from './result-build.js'

import type { Task, TaskResultHandoff } from '../../foundation/types/index.js'

type TaskRunDiagnostics = {
  traceRef?: string
  providerCallId?: string
  attempt?: number
}

export const resolveTaskRunErrorDiagnostics = (
  task: Task,
  error: unknown,
): TaskRunDiagnostics => {
  const diagnostics = readLogDiagnostics(error)
  const providerCallId =
    diagnostics.providerCallId ?? task.result?.providerCallId
  const attempt = diagnostics.attempt ?? task.result?.attempt
  return {
    ...(diagnostics.traceRef ? { traceRef: diagnostics.traceRef } : {}),
    ...(providerCallId ? { providerCallId } : {}),
    ...(typeof attempt === 'number' ? { attempt } : {}),
  }
}

export const buildTaskRunResult = (
  task: Task,
  status: 'succeeded' | 'failed' | 'canceled',
  output: string,
  durationMs: number,
  usage?: Task['usage'],
  traceRef?: string,
  handoff?: TaskResultHandoff,
  diagnostics?: Omit<TaskRunDiagnostics, 'traceRef'>,
) =>
  buildResult(
    task,
    status,
    output,
    durationMs,
    usage,
    traceRef,
    handoff,
    diagnostics,
  )

const parseIsoMs = (value: string | undefined): number | undefined => {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : undefined
}

export const resolveQueueWaitMs = (
  task: Task,
  fallbackStartedAtMs: number,
): number | undefined => {
  const createdAtMs = parseIsoMs(task.createdAt)
  if (createdAtMs === undefined) return undefined
  const startedAtMs = parseIsoMs(task.startedAt) ?? fallbackStartedAtMs
  return Math.max(0, startedAtMs - createdAtMs)
}
