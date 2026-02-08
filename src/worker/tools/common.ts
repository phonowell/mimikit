import { isAbsolute, normalize, resolve } from 'node:path'

export type ToolCallResult = {
  ok: boolean
  output: string
  error?: string
  details?: Record<string, unknown>
}

export type WorkerToolContext = {
  workDir: string
}

export const parseToolArgs = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    } catch {
      throw new Error('tool_args_invalid_json')
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  throw new Error('tool_args_invalid')
}

export const asString = (
  value: unknown,
  field: string,
  required = true,
): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed || !required) return trimmed
  }
  if (!required) return ''
  throw new Error(`tool_arg_invalid:${field}`)
}

export const asStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`tool_arg_invalid:${field}`)
  const output = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
  if (output.length === 0) throw new Error(`tool_arg_invalid:${field}`)
  return output
}

export const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value
  return fallback
}

export const resolveToolPath = (workDir: string, inputPath: string): string => {
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
