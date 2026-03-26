import { z } from 'zod'

const trimmedStringOrUndefinedSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().optional())

const inputBodySchema = z
  .object({
    text: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().min(1),
    ),
    quote: trimmedStringOrUndefinedSchema.optional(),
    language: trimmedStringOrUndefinedSchema.optional(),
    clientLocale: trimmedStringOrUndefinedSchema.optional(),
    clientTimeZone: trimmedStringOrUndefinedSchema.optional(),
    clientOffsetMinutes: z.number().finite().optional(),
    clientNowIso: trimmedStringOrUndefinedSchema.optional(),
  })
  .strict()

export type InputMeta = {
  source: string
  platform?: string
  remote?: string
  userAgent?: string
  language?: string
  clientLocale?: string
  clientTimeZone?: string
  clientOffsetMinutes?: number
  clientNowIso?: string
}

export const parseInputBody = (
  body: unknown,
  request: {
    remoteAddress?: string | undefined
    userAgent?: string | undefined
    acceptLanguage?: string | undefined
  },
): { text: string; meta: InputMeta; quote?: string } | { error: string } => {
  const parsed = inputBodySchema.safeParse(body)
  if (!parsed.success) {
    const hasTextIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === 'text',
    )
    return { error: hasTextIssue ? 'text is required' : 'invalid JSON' }
  }
  const {
    text,
    language: bodyLanguage,
    clientLocale,
    clientTimeZone,
    clientOffsetMinutes,
    clientNowIso,
    quote,
  } = parsed.data

  const meta: InputMeta = { source: 'webui', platform: 'webui' }
  if (request.remoteAddress) meta.remote = request.remoteAddress
  if (request.userAgent) meta.userAgent = request.userAgent
  const language = bodyLanguage ?? request.acceptLanguage
  if (language) meta.language = language
  if (clientLocale) meta.clientLocale = clientLocale
  if (clientTimeZone) meta.clientTimeZone = clientTimeZone
  if (clientOffsetMinutes !== undefined)
    meta.clientOffsetMinutes = clientOffsetMinutes
  if (clientNowIso) meta.clientNowIso = clientNowIso
  return quote ? { text, meta, quote } : { text, meta }
}
