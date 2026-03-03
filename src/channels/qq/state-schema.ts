import { z } from 'zod'

const isoStringSchema = z.string().trim().min(1)

const seenRecordSchema = z.record(z.string(), isoStringSchema)

const replyStateEntrySchema = z
  .object({
    seq: z.number().int().nonnegative(),
    firstSeenAt: isoStringSchema,
    updatedAt: isoStringSchema,
  })
  .strict()

const replyStateSchema = z.record(z.string(), replyStateEntrySchema)

const qqEventStateSchema = z
  .object({
    seenEventIds: seenRecordSchema.optional(),
    seenMessageIds: seenRecordSchema.optional(),
    replyState: replyStateSchema.optional(),
    updatedAt: isoStringSchema.optional(),
  })
  .strict()

export type QqEventState = {
  seenEventIds: Record<string, string>
  seenMessageIds: Record<string, string>
  replyState: Record<
    string,
    {
      seq: number
      firstSeenAt: string
      updatedAt: string
    }
  >
  updatedAt: string
}

export const parseQqEventState = (
  value: unknown,
  nowIso: string,
): QqEventState => {
  const parsed = qqEventStateSchema.safeParse(value)
  if (!parsed.success) {
    return {
      seenEventIds: {},
      seenMessageIds: {},
      replyState: {},
      updatedAt: nowIso,
    }
  }
  return {
    seenEventIds: parsed.data.seenEventIds ?? {},
    seenMessageIds: parsed.data.seenMessageIds ?? {},
    replyState: parsed.data.replyState ?? {},
    updatedAt: parsed.data.updatedAt ?? nowIso,
  }
}
