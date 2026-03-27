import { z } from 'zod'

import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

const nonEmptyString = z.string().trim().min(1)
const REMEMBER_MEMORY_PROTOCOL_TAG_RE = /<M:[^>]+>/i
const REMEMBER_MEMORY_CODE_FENCE_RE = /```|~~~/
const REMEMBER_MEMORY_LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s+/m
const REMEMBER_MEMORY_RUNTIME_ID_RE =
  /\b(?:task|plan|input|focus|runtime|packet|sys|agent)-[a-zA-Z0-9._-]+\b/

export const REMEMBER_MEMORY_MAX_CHARS = 240

export type RememberMemoryContentIssue =
  | 'multiline'
  | 'checklist'
  | 'protocol'
  | 'runtime_ref'
  | 'too_long'

export const rememberMemorySchema = z
  .object({
    content: nonEmptyString,
  })
  .strict()

export const normalizeRememberMemoryContent = (value: string): string =>
  normalizeInlineWhitespace(value)

export const resolveRememberMemoryContentIssue = (
  value: string,
): RememberMemoryContentIssue | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    REMEMBER_MEMORY_PROTOCOL_TAG_RE.test(trimmed) ||
    REMEMBER_MEMORY_CODE_FENCE_RE.test(trimmed)
  )
    return 'protocol'
  if (REMEMBER_MEMORY_LIST_RE.test(trimmed)) return 'checklist'
  if (/\r?\n/.test(trimmed)) return 'multiline'
  if (REMEMBER_MEMORY_RUNTIME_ID_RE.test(trimmed)) return 'runtime_ref'
  if (
    normalizeRememberMemoryContent(trimmed).length > REMEMBER_MEMORY_MAX_CHARS
  )
    return 'too_long'
  return undefined
}
