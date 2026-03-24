import type { Parsed } from '../actions/model/spec.js'
import type { z } from 'zod'

export const parseActionAttrs = <T extends z.ZodTypeAny>(
  item: Parsed,
  schema: T,
): z.infer<T> | undefined => {
  const parsed = schema.safeParse(item.attrs)
  return parsed.success ? parsed.data : undefined
}

export const pickLastParsedAction = <T extends z.ZodTypeAny>(params: {
  items: Parsed[]
  actionName: string
  schema: T
}): z.infer<T> | undefined => {
  let picked: z.infer<T> | undefined
  for (const item of params.items) {
    if (item.name !== params.actionName) continue
    const parsed = parseActionAttrs(item, params.schema)
    if (!parsed) continue
    picked = parsed
  }
  return picked
}

export const pickFirstParsedAction = <T extends z.ZodTypeAny>(params: {
  items: Parsed[]
  actionName: string
  schema: T
}): z.infer<T> | undefined => {
  for (const item of params.items) {
    if (item.name !== params.actionName) continue
    const parsed = parseActionAttrs(item, params.schema)
    if (parsed) return parsed
  }
  return undefined
}
