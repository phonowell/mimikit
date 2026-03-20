import TOML from '@iarna/toml'

import { buildUserConfigDefaults } from './user-config-defaults.js'
import { userConfigInputSchema } from './user-config-schema.js'

import type { UserConfigDefaults } from './user-config-defaults.js'
import type { z } from 'zod'

type UnknownKeyIssue = z.ZodIssue & {
  code: 'unrecognized_keys'
  keys: string[]
}

const isUnknownKeyIssue = (issue: z.ZodIssue): issue is UnknownKeyIssue =>
  issue.code === 'unrecognized_keys'

const formatIssuePath = (path: readonly PropertyKey[]): string => {
  if (path.length === 0) return '<root>'
  return path
    .map((segment) =>
      typeof segment === 'symbol'
        ? `<symbol:${segment.description ?? 'unknown'}>`
        : String(segment),
    )
    .join('.')
}

const formatIssues = (issues: readonly z.ZodIssue[]): string =>
  issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join('; ')

const formatUnknownKeys = (issues: readonly UnknownKeyIssue[]): string[] => {
  const values: string[] = []
  for (const issue of issues) {
    const prefix =
      issue.path.length > 0
        ? `${issue.path.map((item) => String(item)).join('.')}.`
        : ''
    for (const key of issue.keys) values.push(`${prefix}${key}`)
  }
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const stripSymbolKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value.map((item) => stripSymbolKeysDeep(item))
  const record = asRecord(value)
  if (!record) return value
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record))
    next[key] = stripSymbolKeysDeep(child)
  return next
}

const resolveRecordAtPath = (
  root: unknown,
  path: readonly PropertyKey[],
): Record<string, unknown> | undefined => {
  let current: unknown = root
  for (const segment of path) {
    const record = asRecord(current)
    if (!record) return undefined
    current = record[String(segment)]
  }
  return asRecord(current)
}

const stripUnknownIssues = (
  root: unknown,
  issues: readonly UnknownKeyIssue[],
): void => {
  for (const issue of issues) {
    const issuePath = issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    )
    const target = resolveRecordAtPath(root, issuePath)
    if (!target) continue
    for (const key of issue.keys) delete target[key]
  }
}

export const parseConfigInput = (
  source: string,
): { config: UserConfigDefaults; unknownKeys: string[] } => {
  let parsedRaw: unknown
  try {
    parsedRaw = TOML.parse(source) as unknown
  } catch (error) {
    throw new Error(
      `[config] invalid toml defaults: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const parsed = stripSymbolKeysDeep(parsedRaw)
  const validated = userConfigInputSchema.safeParse(parsed)
  if (validated.success) {
    return {
      config: buildUserConfigDefaults(validated.data),
      unknownKeys: [],
    }
  }

  const unknownIssues = validated.error.issues.filter(isUnknownKeyIssue)
  const knownFieldIssues = validated.error.issues.filter(
    (issue) => !isUnknownKeyIssue(issue),
  )
  if (knownFieldIssues.length > 0) {
    throw new Error(
      `[config] invalid toml defaults: ${formatIssues(knownFieldIssues)}`,
    )
  }

  stripUnknownIssues(parsed, unknownIssues)
  const revalidated = userConfigInputSchema.safeParse(parsed)
  if (!revalidated.success) {
    throw new Error(
      `[config] invalid toml defaults: ${formatIssues(revalidated.error.issues)}`,
    )
  }

  return {
    config: buildUserConfigDefaults(revalidated.data),
    unknownKeys: formatUnknownKeys(unknownIssues),
  }
}
