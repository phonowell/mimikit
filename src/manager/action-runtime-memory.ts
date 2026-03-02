import { upsertMemoryRecord } from '../memory/store.js'

import { writeMemorySchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from './runtime-adapter.js'

const parseTags = (raw: string | undefined): string[] => {
  if (!raw) return []
  const unique = new Set<string>()
  for (const part of raw.split(',')) {
    const tag = part.replace(/\s+/g, ' ').trim()
    if (!tag) continue
    unique.add(tag)
  }
  return Array.from(unique)
}

export const applyWriteMemoryAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = writeMemorySchema.safeParse(item.attrs)
  if (!parsed.success) return

  const payload = {
    content: parsed.data.content,
    tags: parseTags(parsed.data.tags),
    ...(parsed.data.source ? { source: parsed.data.source } : {}),
    ...(parsed.data.score ? { score: Number(parsed.data.score) } : {}),
    ...(parsed.data.ttl_days ? { ttlDays: Number(parsed.data.ttl_days) } : {}),
    ...(parsed.data.expires_at ? { expiresAt: parsed.data.expires_at } : {}),
  }

  await upsertMemoryRecord(runtime.paths.memoryRecords, payload)
}
