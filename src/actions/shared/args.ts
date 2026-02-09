import { isAbsolute, normalize, resolve } from 'node:path'

import { z } from 'zod'

import type { Result } from '../model/spec.js'

const rawArgsSchema = z.record(z.string(), z.unknown())

const formatArgError = (error: z.ZodError): string => {
  const issue = error.issues[0]
  if (!issue) return 'action_args_invalid'
  if (issue.code === 'unrecognized_keys') {
    const key = issue.keys[0]
    if (key) return `action_arg_invalid:${key}`
  }
  const head = issue.path[0]
  if (typeof head === 'string' && head.length > 0)
    return `action_arg_invalid:${head}`
  return 'action_args_invalid'
}

const parseRawArgs = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'string') {
    const validated = rawArgsSchema.safeParse(value)
    if (!validated.success) throw new Error('action_args_invalid')
    return validated.data
  }

  const trimmed = value.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const validated = rawArgsSchema.safeParse(parsed)
    if (!validated.success) throw new Error('action_args_invalid')
    return validated.data
  } catch (error) {
    if (error instanceof Error && error.message === 'action_args_invalid')
      throw error
    throw new Error('action_args_invalid_json')
  }
}

export const parseArgs = <TSchema extends z.ZodTypeAny>(
  value: unknown,
  schema: TSchema,
): z.infer<TSchema> => {
  const parsed = schema.safeParse(parseRawArgs(value))
  if (!parsed.success) throw new Error(formatArgError(parsed.error))
  return parsed.data
}

export const buildArgsSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.object(shape).strict()

export const nonEmptyString = z.string().trim().min(1)

export const booleanLike = z.union([
  z.boolean(),
  z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === 'true') return true
      if (value === 'false') return false
      context.addIssue({
        code: 'custom',
        message: 'boolean_expected',
      })
      return z.NEVER
    }),
])

export const resolvePath = (workDir: string, inputPath: string): string => {
  const normalizedInput = normalize(inputPath)
  if (isAbsolute(normalizedInput)) return normalizedInput
  return resolve(workDir, normalizedInput)
}

export const quoteShellValue = (value: string): string =>
  `"${value.replaceAll('"', '\\"')}"`

export const prependWorkDir = (
  workDir: string,
  command: string | string[],
): string[] => {
  const list = Array.isArray(command) ? command : [command]
  return [`cd ${quoteShellValue(workDir)}`, ...list]
}

export const safeRun = async (
  handler: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await handler()
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
