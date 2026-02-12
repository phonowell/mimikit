import { z } from 'zod'

import { normalizeTokenUsage, tokenUsageSchema } from './token-usage.js'

import type { Task } from '../types/index.js'

export type RuntimeSnapshot = {
  tasks: Task[]
  queues?: {
    inputsCursor: number
    resultsCursor: number
  }
}

const taskCancelSchema = z
  .object({
    source: z.enum(['user', 'manager', 'system']),
    reason: z.string().optional(),
  })
  .strict()

const taskResultRawSchema = z
  .object({
    taskId: z.string().trim().min(1),
    status: z.enum(['succeeded', 'failed', 'canceled']),
    ok: z.boolean(),
    output: z.string(),
    durationMs: z.number().finite().nonnegative(),
    completedAt: z.string(),
    usage: tokenUsageSchema.optional(),
    title: z.string().optional(),
    archivePath: z.string().optional(),
    profile: z.enum(['standard', 'specialist']).optional(),
    cancel: taskCancelSchema.optional(),
  })
  .strict()

const taskRawSchema = z
  .object({
    id: z.string().trim().min(1),
    fingerprint: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    profile: z.enum(['standard', 'specialist']),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'canceled']),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    attempts: z.number().int().nonnegative().optional(),
    usage: tokenUsageSchema.optional(),
    archivePath: z.string().optional(),
    cancel: taskCancelSchema.optional(),
    result: taskResultRawSchema.optional(),
  })
  .strict()

const queueStateSchema = z
  .object({
    inputsCursor: z.number().int().nonnegative(),
    resultsCursor: z.number().int().nonnegative(),
  })
  .strict()

const runtimeSnapshotRawSchema = z
  .object({
    tasks: z.array(taskRawSchema),
    queues: queueStateSchema.optional(),
  })
  .strict()

const toTask = (task: z.infer<typeof taskRawSchema>): Task => {
  const usage = normalizeTokenUsage(task.usage)
  const resultUsage = normalizeTokenUsage(task.result?.usage)
  const cancel =
    task.cancel !== undefined
      ? {
          source: task.cancel.source,
          ...(task.cancel.reason !== undefined
            ? { reason: task.cancel.reason }
            : {}),
        }
      : undefined
  const resultCancel =
    task.result?.cancel !== undefined
      ? {
          source: task.result.cancel.source,
          ...(task.result.cancel.reason !== undefined
            ? { reason: task.result.cancel.reason }
            : {}),
        }
      : undefined
  const result =
    task.result !== undefined
      ? {
          taskId: task.result.taskId,
          status: task.result.status,
          ok: task.result.ok,
          output: task.result.output,
          durationMs: task.result.durationMs,
          completedAt: task.result.completedAt,
          ...(resultUsage ? { usage: resultUsage } : {}),
          ...(task.result.title !== undefined
            ? { title: task.result.title }
            : {}),
          ...(task.result.archivePath !== undefined
            ? { archivePath: task.result.archivePath }
            : {}),
          ...(task.result.profile !== undefined
            ? { profile: task.result.profile }
            : {}),
          ...(resultCancel !== undefined ? { cancel: resultCancel } : {}),
        }
      : undefined
  return {
    id: task.id,
    fingerprint: task.fingerprint,
    prompt: task.prompt,
    title: task.title,
    profile: task.profile,
    status: task.status,
    createdAt: task.createdAt,
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.completedAt !== undefined
      ? { completedAt: task.completedAt }
      : {}),
    ...(task.durationMs !== undefined ? { durationMs: task.durationMs } : {}),
    ...(task.attempts !== undefined ? { attempts: task.attempts } : {}),
    ...(usage ? { usage } : {}),
    ...(task.archivePath !== undefined
      ? { archivePath: task.archivePath }
      : {}),
    ...(cancel !== undefined ? { cancel } : {}),
    ...(result !== undefined ? { result } : {}),
  }
}

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotRawSchema.parse(value)

  return {
    tasks: parsed.tasks.map((task) => toTask(task)),
    ...(parsed.queues ? { queues: parsed.queues } : {}),
  }
}
