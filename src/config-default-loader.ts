import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { telegramConfigSchema } from './channels/telegram/config.js'

import type { TelegramConfig } from './channels/telegram/config.js'

const modelReasoningEffortSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])

const managerProviderInputSchema = z
  .object({
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
  })
  .strict()

const managerInputSchema = z
  .object({
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
    provider: managerProviderInputSchema.optional(),
    maxCorrectionRounds: z.number().int().positive().optional(),
    promptSections: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    taskCreate: z
      .object({
        debounceMs: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    taskWindow: z
      .object({
        maxCount: z.number().int().positive().optional(),
        minCount: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    planWindow: z
      .object({
        maxCount: z.number().int().positive().optional(),
        minCount: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const workerInputSchema = z
  .object({
    maxConcurrent: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
    retry: z
      .object({
        maxAttempts: z.number().int().nonnegative().optional(),
        backoffMs: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const userConfigInputSchema = z
  .object({
    manager: managerInputSchema.optional(),
    worker: workerInputSchema.optional(),
    telegram: telegramConfigSchema.partial().strict().optional(),
  })
  .strict()

type UserConfigInput = z.infer<typeof userConfigInputSchema>

export type UserConfigDefaults = {
  manager: {
    model: string
    modelReasoningEffort: z.infer<typeof modelReasoningEffortSchema>
    provider: {
      baseUrl?: string | undefined
      apiKey?: string | undefined
    }
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
    model: string
    modelReasoningEffort: z.infer<typeof modelReasoningEffortSchema>
  }
  telegram: TelegramConfig
}

const DEFAULT_USER_CONFIG: UserConfigDefaults = {
  manager: {
    model: 'gpt-5.2',
    modelReasoningEffort: 'medium',
    provider: {},
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 600000,
    model: 'gpt-5.3-codex',
    modelReasoningEffort: 'high',
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
  },
}

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

type UnknownKeyIssue = z.ZodIssue & {
  code: 'unrecognized_keys'
  keys: string[]
}

const isUnknownKeyIssue = (issue: z.ZodIssue): issue is UnknownKeyIssue =>
  issue.code === 'unrecognized_keys'

const formatIssues = (issues: readonly z.ZodIssue[]): string =>
  issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
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

export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../config.yaml', import.meta.url),
)
export const DEFAULT_CONFIG_TEMPLATE_PATH = fileURLToPath(
  new URL('../defaults/config.template.yaml', import.meta.url),
)

const readOrCreateConfigSource = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== 'ENOENT') throw error
  }
  const fallbackSource = readFileSync(DEFAULT_CONFIG_TEMPLATE_PATH, 'utf8')
  try {
    writeFileSync(path, fallbackSource, { encoding: 'utf8', flag: 'wx' })
    return fallbackSource
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== 'EEXIST') throw error
    return readFileSync(path, 'utf8')
  }
}

const buildUserConfigDefaults = (
  input: UserConfigInput,
): UserConfigDefaults => {
  const managerProvider = input.manager?.provider
  const baseUrl = trimToUndefined(managerProvider?.baseUrl)
  const apiKey = trimToUndefined(managerProvider?.apiKey)

  return {
    manager: {
      model:
        input.manager?.model ??
        managerProvider?.model ??
        DEFAULT_USER_CONFIG.manager.model,
      modelReasoningEffort:
        input.manager?.modelReasoningEffort ??
        managerProvider?.modelReasoningEffort ??
        DEFAULT_USER_CONFIG.manager.modelReasoningEffort,
      provider: {
        ...(baseUrl ? { baseUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
      },
    },
    worker: {
      maxConcurrent:
        input.worker?.maxConcurrent ?? DEFAULT_USER_CONFIG.worker.maxConcurrent,
      timeoutMs:
        input.worker?.timeoutMs ?? DEFAULT_USER_CONFIG.worker.timeoutMs,
      model: input.worker?.model ?? DEFAULT_USER_CONFIG.worker.model,
      modelReasoningEffort:
        input.worker?.modelReasoningEffort ??
        DEFAULT_USER_CONFIG.worker.modelReasoningEffort,
    },
    telegram: {
      enabled: input.telegram?.enabled ?? DEFAULT_USER_CONFIG.telegram.enabled,
      botToken:
        input.telegram?.botToken ?? DEFAULT_USER_CONFIG.telegram.botToken,
      chatId: input.telegram?.chatId ?? DEFAULT_USER_CONFIG.telegram.chatId,
      apiRoot: input.telegram?.apiRoot ?? DEFAULT_USER_CONFIG.telegram.apiRoot,
    },
  }
}

const parseConfigInput = (
  source: string,
): { config: UserConfigDefaults; unknownKeys: string[] } => {
  const parsed = (parseYaml(source) ?? {}) as unknown
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
      `[config] invalid yaml defaults: ${formatIssues(knownFieldIssues)}`,
    )
  }

  stripUnknownIssues(parsed, unknownIssues)
  const revalidated = userConfigInputSchema.safeParse(parsed)
  if (!revalidated.success) {
    throw new Error(
      `[config] invalid yaml defaults: ${formatIssues(revalidated.error.issues)}`,
    )
  }

  return {
    config: buildUserConfigDefaults(revalidated.data),
    unknownKeys: formatUnknownKeys(unknownIssues),
  }
}

export type LoadDefaultConfigFromYamlOptions = {
  onUnknownKeys?: (keys: readonly string[]) => void
}

export const loadDefaultConfigFromYaml = (
  path = DEFAULT_CONFIG_PATH,
  options: LoadDefaultConfigFromYamlOptions = {},
): UserConfigDefaults => {
  const source = readOrCreateConfigSource(path)
  const parsed = parseConfigInput(source)
  if (parsed.unknownKeys.length > 0) options.onUnknownKeys?.(parsed.unknownKeys)
  return parsed.config
}
