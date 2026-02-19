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

const focusReplacePayloadSchema = z
  .object({
    active: z.array(focusDraftSchema),
  })
  .strict()

export type FocusReplaceDraft = z.infer<typeof focusDraftSchema>

export type FocusReplacePayload = z.infer<typeof focusReplacePayloadSchema>

export const isReplaceFocusesAction = (item: Parsed): boolean =>
  item.name === 'replace_focuses'

export const parseReplaceFocusesPayload = (
  item: Parsed,
): { ok: true; payload: FocusReplacePayload } | { ok: false; error: string } => {
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
  const parsed = focusReplacePayloadSchema.safeParse(parsedJson)
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
