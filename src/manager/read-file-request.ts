import { z } from 'zod'

import { pickFirstParsedAction } from './action-parse.js'

import type { Parsed } from '../actions/model/spec.js'

const DEFAULT_MAX_CHARS = 8 * 1_024
const MAX_MAX_CHARS = 20_000
const MIN_MAX_CHARS = 1
const DEFAULT_FROM_LINE = 1
const MIN_FROM_LINE = 1
const DEFAULT_MAX_LINES = 100
const MAX_MAX_LINES = 500
const MIN_MAX_LINES = 1

const nonEmptyString = z.string().trim().min(1)
const integerStringRe = /^[+-]?\d+$/

const boundedIntegerString = (params: {
  min: number
  max: number
  field: string
}) =>
  z
    .string()
    .trim()
    .regex(integerStringRe, `${params.field} must be an integer string`)
    .refine((value) => {
      const parsed = Number(value)
      return (
        Number.isSafeInteger(parsed) &&
        parsed >= params.min &&
        parsed <= params.max
      )
    }, `${params.field} must be in range [${params.min}, ${params.max}]`)

export const readFileToolSchema = z
  .object({
    path: nonEmptyString,
    from_line: boundedIntegerString({
      min: MIN_FROM_LINE,
      max: Number.MAX_SAFE_INTEGER,
      field: 'from_line',
    }).optional(),
    max_lines: boundedIntegerString({
      min: MIN_MAX_LINES,
      max: MAX_MAX_LINES,
      field: 'max_lines',
    }).optional(),
    max_chars: boundedIntegerString({
      min: MIN_MAX_CHARS,
      max: MAX_MAX_CHARS,
      field: 'max_chars',
    }).optional(),
  })
  .strict()

export type ReadFileRequest = {
  path: string
  fromLine: number
  maxLines: number
  maxChars: number
}

const toReadFileRequest = (
  parsed: z.infer<typeof readFileToolSchema>,
): ReadFileRequest => ({
  path: parsed.path,
  fromLine: Number(parsed.from_line ?? DEFAULT_FROM_LINE),
  maxLines: Number(parsed.max_lines ?? DEFAULT_MAX_LINES),
  maxChars: Number(parsed.max_chars ?? DEFAULT_MAX_CHARS),
})

export const pickReadFileRequest = (
  actions: Parsed[],
): ReadFileRequest | undefined => {
  const parsed = pickFirstParsedAction({
    items: actions,
    actionName: 'read_file',
    schema: readFileToolSchema,
  })
  return parsed ? toReadFileRequest(parsed) : undefined
}

export const buildReadFileLookupKey = (
  request?: ReadFileRequest,
): string | undefined => {
  if (!request) return undefined
  return `${request.path}\n${request.fromLine}\n${request.maxLines}\n${request.maxChars}`
}
