import { basename, dirname, join, resolve } from 'node:path'

import { z } from 'zod'

import { readJson, writeJson } from '../fs/json.js'
import { newId, nowIso } from '../shared/utils.js'

const pendingRestartSummarySchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^sys-summary-[a-zA-Z0-9._-]+$/),
    summary: z.string().trim().min(1),
    sourceRuntimeId: z
      .string()
      .trim()
      .regex(/^runtime-[a-zA-Z0-9._-]+$/),
    createdAt: z.string().trim().min(1),
    consumed: z.boolean(),
    consumedAt: z.string().trim().min(1).optional(),
    injectedMessageId: z.string().trim().min(1).optional(),
  })
  .strict()

export type PendingRestartSummary = z.infer<typeof pendingRestartSummarySchema>

const pendingRestartSummaryPath = (stateDir: string): string => {
  const resolvedStateDir = resolve(stateDir)
  const parentDir = dirname(resolvedStateDir)
  const stateDirName = basename(resolvedStateDir)
  return join(parentDir, `${stateDirName}.pending-summary.json`)
}

export const readPendingRestartSummary = async (
  stateDir: string,
): Promise<PendingRestartSummary | undefined> => {
  const raw = await readJson<unknown | null>(
    pendingRestartSummaryPath(stateDir),
    null,
  )
  if (!raw) return undefined
  return pendingRestartSummarySchema.parse(raw)
}

export const writePendingRestartSummary = async (
  stateDir: string,
  record: PendingRestartSummary,
): Promise<void> => {
  await writeJson(pendingRestartSummaryPath(stateDir), record)
}

export const upsertPendingRestartSummary = async (params: {
  stateDir: string
  summary: string
  sourceRuntimeId: string
}): Promise<PendingRestartSummary> => {
  const existing = await readPendingRestartSummary(params.stateDir)
  if (existing && !existing.consumed) return existing

  const summary = params.summary.trim()
  const next: PendingRestartSummary = {
    id: `sys-summary-${newId()}`,
    summary,
    sourceRuntimeId: params.sourceRuntimeId.trim(),
    createdAt: nowIso(),
    consumed: false,
  }
  await writePendingRestartSummary(params.stateDir, next)
  return next
}

export const markPendingRestartSummaryConsumed = async (params: {
  stateDir: string
  id: string
  injectedMessageId?: string
}): Promise<PendingRestartSummary | undefined> => {
  const existing = await readPendingRestartSummary(params.stateDir)
  if (!existing) return undefined
  if (existing.id !== params.id) return existing
  if (existing.consumed) return existing

  const next: PendingRestartSummary = {
    ...existing,
    consumed: true,
    consumedAt: nowIso(),
    ...(params.injectedMessageId
      ? { injectedMessageId: params.injectedMessageId }
      : {}),
  }
  await writePendingRestartSummary(params.stateDir, next)
  return next
}
