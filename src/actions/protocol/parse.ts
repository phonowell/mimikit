import { z } from 'zod'

import { collectTagMatches, extractActionText } from './extract-block.js'

import type { Parsed } from '../model/spec.js'

const parsedSchema = z
  .object({
    name: z.string().trim().min(1),
    attrs: z.record(z.string(), z.string()),
    content: z.string().trim().min(1).optional(),
  })
  .strict()

const asParsed = (value: Parsed): Parsed | undefined => {
  const parsed = parsedSchema.safeParse(value)
  if (!parsed.success) return undefined
  return parsed.data
}

const parseTagMatches = (
  matches: ReturnType<typeof collectTagMatches>,
): Parsed[] =>
  matches
    .map((match) =>
      asParsed({
        name: match.name,
        attrs: match.attrs,
        ...(match.content ? { content: match.content } : {}),
      }),
    )
    .filter((item): item is Parsed => item !== undefined)

export const parseActions = (
  output: string,
): { actions: Parsed[]; text: string } => {
  const { actionText, text } = extractActionText(output)
  if (!actionText) return { actions: [], text }
  return { actions: parseTagMatches(collectTagMatches(actionText)), text }
}
