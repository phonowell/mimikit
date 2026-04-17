import { resolveSystemEvent } from './system-event.js'

import type { Role } from '../../foundation/types/base.js'

export type MessageProvenance = {
  sourceInputIds?: string[]
  sourceTaskIds?: string[]
  sourcePlanIds?: string[]
}

type MessageProvenanceCarrier = MessageProvenance & {
  role: Role
  text: string
  systemEventName?: string
  systemEventPayload?: Record<string, unknown>
}

export const normalizeProvenanceIds = (
  values: unknown[],
): string[] | undefined => {
  const normalized = values.flatMap((value) => {
    if (typeof value !== 'string') return []
    const id = value.trim()
    return id ? [id] : []
  })
  if (normalized.length === 0) return undefined
  return [...new Set(normalized)]
}

export const readProvenancePayloadIds = (
  payload: Record<string, unknown> | undefined,
  singularKeys: string[],
  pluralKeys: string[],
): string[] | undefined => {
  if (!payload) return undefined
  const values: unknown[] = []
  for (const key of singularKeys) values.push(payload[key])
  for (const key of pluralKeys) {
    const value = payload[key]
    if (Array.isArray(value)) values.push(...value)
  }
  return normalizeProvenanceIds(values)
}

export const mergeMessageProvenance = (
  ...sources: Array<MessageProvenance | undefined>
): MessageProvenance => {
  const sourceInputIds = normalizeProvenanceIds(
    sources.flatMap((source) => source?.sourceInputIds ?? []),
  )
  const sourceTaskIds = normalizeProvenanceIds(
    sources.flatMap((source) => source?.sourceTaskIds ?? []),
  )
  const sourcePlanIds = normalizeProvenanceIds(
    sources.flatMap((source) => source?.sourcePlanIds ?? []),
  )
  return {
    ...(sourceInputIds ? { sourceInputIds } : {}),
    ...(sourceTaskIds ? { sourceTaskIds } : {}),
    ...(sourcePlanIds ? { sourcePlanIds } : {}),
  }
}

export const hasMessageProvenance = (source: MessageProvenance): boolean =>
  (source.sourceInputIds?.length ?? 0) > 0 ||
  (source.sourceTaskIds?.length ?? 0) > 0 ||
  (source.sourcePlanIds?.length ?? 0) > 0

export const resolveMessageProvenance = (
  source: MessageProvenanceCarrier | undefined,
): MessageProvenance => {
  if (!source) return {}
  const direct = {
    ...(source.sourceInputIds ? { sourceInputIds: source.sourceInputIds } : {}),
    ...(source.sourceTaskIds ? { sourceTaskIds: source.sourceTaskIds } : {}),
    ...(source.sourcePlanIds ? { sourcePlanIds: source.sourcePlanIds } : {}),
  }
  if (source.role !== 'system') return direct
  const { payload } = resolveSystemEvent(source)
  const sourceInputIds = readProvenancePayloadIds(
    payload,
    ['source_input_id'],
    ['source_input_ids'],
  )
  const sourceTaskIds = readProvenancePayloadIds(
    payload,
    ['task_id', 'source_task_id'],
    ['task_ids', 'source_task_ids'],
  )
  const sourcePlanIds = readProvenancePayloadIds(
    payload,
    ['plan_id', 'source_plan_id'],
    ['plan_ids', 'source_plan_ids'],
  )
  const fromPayload = {
    ...(sourceInputIds ? { sourceInputIds } : {}),
    ...(sourceTaskIds ? { sourceTaskIds } : {}),
    ...(sourcePlanIds ? { sourcePlanIds } : {}),
  }
  return mergeMessageProvenance(direct, fromPayload)
}
