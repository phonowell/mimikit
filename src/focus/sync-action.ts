import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'

const nonEmptyString = z.string().trim().min(1)

const focusDraftSchema = z
  .object({
    id: nonEmptyString.optional(),
    title: nonEmptyString,
    summary: nonEmptyString,
    confidence: z.number().finite().min(0).max(1).optional(),
    evidence_ids: z.array(nonEmptyString).min(1).max(12),
  })
  .strict()

const focusSyncPayloadSchema = z
  .object({
    active: z.array(focusDraftSchema),
  })
  .strict()

export type FocusSyncDraft = z.infer<typeof focusDraftSchema>

export type FocusSyncPayload = z.infer<typeof focusSyncPayloadSchema>

export const isSyncFocusesAction = (item: Parsed): boolean =>
  item.name === 'sync_focuses'

export const parseSyncFocusesPayload = (
  item: Parsed,
): { ok: true; payload: FocusSyncPayload } | { ok: false; error: string } => {
  const raw = item.content?.trim()
  if (!raw) return { ok: false, error: 'content is required' }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  const parsed = focusSyncPayloadSchema.safeParse(parsedJson)
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 3)
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
        return `${path}: ${issue.message}`
      })
      .join('; ')
    return { ok: false, error: details || 'payload validation failed' }
  }
  return { ok: true, payload: parsed.data }
}
