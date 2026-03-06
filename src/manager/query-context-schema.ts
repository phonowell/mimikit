import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'

export const queryContextSchema = z
  .object({
    query: z.string().trim().min(1),
  })
  .strict()

export type QueryContextRequest = {
  query: string
}

export const pickQueryContextRequest = (
  items: Parsed[],
): QueryContextRequest | undefined => {
  let picked: QueryContextRequest | undefined
  for (const item of items) {
    if (item.name !== 'query_context') continue
    const parsed = queryContextSchema.safeParse(item.attrs)
    if (!parsed.success) continue
    picked = {
      query: parsed.data.query,
    }
  }
  return picked
}
