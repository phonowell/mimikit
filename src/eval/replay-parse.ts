import { ReplaySuiteFormatError } from './replay-types.js'

import type {
  HistoryMessage,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

export const requireRecord = (
  value: unknown,
  path: string,
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReplaySuiteFormatError(`${path} must be an object`)

  return value as Record<string, unknown>
}

export const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string')
    throw new ReplaySuiteFormatError(`${path} must be a string`)

  return value
}

export const optionalString = (
  value: unknown,
  path: string,
): string | undefined => {
  if (value === undefined || value === null) return undefined
  return requireString(value, path)
}

export const requireNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value))
    throw new ReplaySuiteFormatError(`${path} must be a number`)

  return value
}

export const optionalNumber = (
  value: unknown,
  path: string,
): number | undefined => {
  if (value === undefined || value === null) return undefined
  return requireNumber(value, path)
}

export const requireBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean')
    throw new ReplaySuiteFormatError(`${path} must be a boolean`)

  return value
}

export const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value))
    throw new ReplaySuiteFormatError(`${path} must be an array`)

  return value
}

export const parseStringArray = (value: unknown, path: string): string[] =>
  requireArray(value, path).map((item, index) =>
    requireString(item, `${path}[${index}]`),
  )

const parseTokenUsage = (
  value: unknown,
  path: string,
): TokenUsage | undefined => {
  if (value === undefined) return undefined
  const record = requireRecord(value, path)
  const input = optionalNumber(record.input, `${path}.input`)
  const output = optionalNumber(record.output, `${path}.output`)
  const total = optionalNumber(record.total, `${path}.total`)
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export const parseHistoryMessage = (
  value: unknown,
  path: string,
): HistoryMessage => {
  const record = requireRecord(value, path)
  const role = requireString(record.role, `${path}.role`)
  if (role !== 'user' && role !== 'manager' && role !== 'system')
    throw new ReplaySuiteFormatError(`${path}.role must be user|manager|system`)

  const quote = optionalString(record.quote, `${path}.quote`)
  const elapsedMs = optionalNumber(record.elapsedMs, `${path}.elapsedMs`)
  const usage = parseTokenUsage(record.usage, `${path}.usage`)
  return {
    id: requireString(record.id, `${path}.id`),
    role,
    text: requireString(record.text, `${path}.text`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
    ...(quote !== undefined ? { quote } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(usage ? { usage } : {}),
  }
}

export const parseUserInput = (value: unknown, path: string): UserInput => {
  const record = requireRecord(value, path)
  const quote = optionalString(record.quote, `${path}.quote`)
  return {
    id: requireString(record.id, `${path}.id`),
    text: requireString(record.text, `${path}.text`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
    ...(quote !== undefined ? { quote } : {}),
  }
}

export const parseTaskResult = (value: unknown, path: string): TaskResult => {
  const record = requireRecord(value, path)
  const status = requireString(record.status, `${path}.status`)
  if (status !== 'succeeded' && status !== 'failed' && status !== 'canceled') {
    throw new ReplaySuiteFormatError(
      `${path}.status must be succeeded|failed|canceled`,
    )
  }
  const usage = parseTokenUsage(record.usage, `${path}.usage`)
  const title = optionalString(record.title, `${path}.title`)
  const archivePath = optionalString(record.archivePath, `${path}.archivePath`)
  return {
    taskId: requireString(record.taskId, `${path}.taskId`),
    status,
    ok: requireBoolean(record.ok, `${path}.ok`),
    output: requireString(record.output, `${path}.output`),
    durationMs: requireNumber(record.durationMs, `${path}.durationMs`),
    completedAt: requireString(record.completedAt, `${path}.completedAt`),
    ...(usage ? { usage } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(archivePath !== undefined ? { archivePath } : {}),
  }
}

export const parseTask = (value: unknown, path: string): Task => {
  const record = requireRecord(value, path)
  const status = requireString(record.status, `${path}.status`)
  if (
    status !== 'pending' &&
    status !== 'running' &&
    status !== 'succeeded' &&
    status !== 'failed' &&
    status !== 'canceled'
  ) {
    throw new ReplaySuiteFormatError(
      `${path}.status must be pending|running|succeeded|failed|canceled`,
    )
  }
  const result =
    record.result === undefined
      ? undefined
      : parseTaskResult(record.result, `${path}.result`)
  const startedAt = optionalString(record.startedAt, `${path}.startedAt`)
  const completedAt = optionalString(record.completedAt, `${path}.completedAt`)
  const durationMs = optionalNumber(record.durationMs, `${path}.durationMs`)
  const usage = parseTokenUsage(record.usage, `${path}.usage`)
  const archivePath = optionalString(record.archivePath, `${path}.archivePath`)
  return {
    id: requireString(record.id, `${path}.id`),
    fingerprint: requireString(record.fingerprint, `${path}.fingerprint`),
    prompt: requireString(record.prompt, `${path}.prompt`),
    title: requireString(record.title, `${path}.title`),
    status,
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(usage ? { usage } : {}),
    ...(archivePath !== undefined ? { archivePath } : {}),
    ...(result ? { result } : {}),
  }
}
