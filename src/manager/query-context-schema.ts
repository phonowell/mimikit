import { z } from 'zod'

import { pickLastParsedAction } from './action-parse.js'

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
  const parsed = pickLastParsedAction({
    items,
    actionName: 'query_context',
    schema: queryContextSchema,
  })
  return parsed ? { query: parsed.query } : undefined
}

export const buildQueryContextLookupKey = (
  request?: QueryContextRequest,
): string | undefined => request?.query
