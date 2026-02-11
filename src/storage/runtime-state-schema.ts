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
  }
}

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotRawSchema.parse(value)

  return {
    tasks: parsed.tasks.map((task) => toTask(task)),
    ...(parsed.queues ? { queues: parsed.queues } : {}),
  }
}
