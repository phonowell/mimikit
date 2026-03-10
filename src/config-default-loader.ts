import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import TOML from '@iarna/toml'
import { z } from 'zod'

import { feishuConfigSchema } from './channels/feishu/config.js'
import { telegramConfigSchema } from './channels/telegram/config.js'

import type { FeishuConfig } from './channels/feishu/config.js'
import type { TelegramConfig } from './channels/telegram/config.js'

const modelReasoningEffortSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])
const providerCapabilitySchema = z.enum(['low', 'medium', 'high'])
const providerBillingSchema = z.enum(['free', 'low', 'medium', 'high'])

const managerInputSchema = z
  .object({
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    proxy: z.string().optional(),
  })
  .strict()

const workerInputSchema = z
  .object({
    maxConcurrent: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    budget: z
      .object({
        maxDurationMs: z.number().int().positive().optional(),
        maxRounds: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const codexInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
    proxy: z.string().optional(),
    capability: providerCapabilitySchema.optional(),
    billing: providerBillingSchema.optional(),
  })
  .strict()

const opencodeInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z.string().min(1).optional(),
    proxy: z.string().optional(),
    capability: providerCapabilitySchema.optional(),
    billing: providerBillingSchema.optional(),
  })
  .strict()

const webuiInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    port: z.number().int().positive().max(65535).optional(),
  })
  .strict()

const userConfigInputSchema = z
  .object({
    manager: managerInputSchema.optional(),
    worker: workerInputSchema.optional(),
    codex: codexInputSchema.optional(),
    opencode: opencodeInputSchema.optional(),
    webui: webuiInputSchema.optional(),
    telegram: telegramConfigSchema.partial().strict().optional(),
    feishu: feishuConfigSchema.partial().strict().optional(),
  })
  .strict()

type UserConfigInput = z.infer<typeof userConfigInputSchema>

export type UserConfigDefaults = {
  manager: {
    model: string
    modelReasoningEffort: z.infer<typeof modelReasoningEffortSchema>
    baseUrl?: string | undefined
    apiKey?: string | undefined
    proxy?: string | undefined
  }
  worker: {
    maxConcurrent: number
    timeoutMs: number
    budget: {
      maxDurationMs: number
      maxRounds: number
    }
  }
  codex: {
    enabled: boolean
    model: string
    modelReasoningEffort: z.infer<typeof modelReasoningEffortSchema>
    capability: z.infer<typeof providerCapabilitySchema>
    billing: z.infer<typeof providerBillingSchema>
    proxy?: string | undefined
  }
  opencode: {
    enabled: boolean
    model: string
    capability: z.infer<typeof providerCapabilitySchema>
    billing: z.infer<typeof providerBillingSchema>
    proxy?: string | undefined
  }
  webui: {
    enabled: boolean
    port: number
  }
  telegram: TelegramConfig
  feishu: FeishuConfig
}

const DEFAULT_USER_CONFIG: UserConfigDefaults = {
  manager: {
    model: 'gpt-5.2',
    modelReasoningEffort: 'medium',
    baseUrl: '',
    apiKey: '',
    proxy: '',
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 600000,
    budget: {
      maxDurationMs: 1200000,
      maxRounds: 3,
    },
  },
  codex: {
    enabled: true,
    model: 'gpt-5.4',
    modelReasoningEffort: 'high',
    capability: 'high',
    billing: 'medium',
    proxy: '',
  },
  opencode: {
    enabled: false,
    model: 'big-pickle',
    capability: 'low',
    billing: 'free',
    proxy: '',
  },
  webui: {
    enabled: true,
    port: 8787,
  },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
  },
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
    chatId: '',
  },
}

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const trimOrEmpty = (value: string | undefined): string => {
  if (value === undefined) return ''
  return value.trim()
}

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

export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../config.toml', import.meta.url),
)
export const DEFAULT_CONFIG_TEMPLATE_PATH = fileURLToPath(
  new URL('../defaults/config.template.toml', import.meta.url),
)

const readConfigSourceOrTemplate = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== 'ENOENT') throw error
  }
  return readFileSync(DEFAULT_CONFIG_TEMPLATE_PATH, 'utf8')
}

const buildUserConfigDefaults = (
  input: UserConfigInput,
): UserConfigDefaults => {
  const baseUrl = trimToUndefined(input.manager?.baseUrl)
  const apiKey = trimToUndefined(input.manager?.apiKey)
  const managerProxy = trimToUndefined(input.manager?.proxy)
  const codexProxy = trimToUndefined(input.codex?.proxy)
  const opencodeProxy = trimToUndefined(input.opencode?.proxy)
  const telegramApiRoot = trimToUndefined(input.telegram?.apiRoot)

  return {
    manager: {
      model: input.manager?.model ?? DEFAULT_USER_CONFIG.manager.model,
      modelReasoningEffort:
        input.manager?.modelReasoningEffort ??
        DEFAULT_USER_CONFIG.manager.modelReasoningEffort,
      ...(baseUrl ? { baseUrl } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(managerProxy ? { proxy: managerProxy } : {}),
    },
    worker: {
      maxConcurrent:
        input.worker?.maxConcurrent ?? DEFAULT_USER_CONFIG.worker.maxConcurrent,
      timeoutMs:
        input.worker?.timeoutMs ?? DEFAULT_USER_CONFIG.worker.timeoutMs,
      budget: {
        maxDurationMs:
          input.worker?.budget?.maxDurationMs ??
          DEFAULT_USER_CONFIG.worker.budget.maxDurationMs,
        maxRounds:
          input.worker?.budget?.maxRounds ??
          DEFAULT_USER_CONFIG.worker.budget.maxRounds,
      },
    },
    codex: {
      enabled: input.codex?.enabled ?? DEFAULT_USER_CONFIG.codex.enabled,
      model: input.codex?.model ?? DEFAULT_USER_CONFIG.codex.model,
      modelReasoningEffort:
        input.codex?.modelReasoningEffort ??
        DEFAULT_USER_CONFIG.codex.modelReasoningEffort,
      capability:
        input.codex?.capability ?? DEFAULT_USER_CONFIG.codex.capability,
      billing: input.codex?.billing ?? DEFAULT_USER_CONFIG.codex.billing,
      ...(codexProxy ? { proxy: codexProxy } : {}),
    },
    opencode: {
      enabled: input.opencode?.enabled ?? DEFAULT_USER_CONFIG.opencode.enabled,
      model: input.opencode?.model ?? DEFAULT_USER_CONFIG.opencode.model,
      capability:
        input.opencode?.capability ?? DEFAULT_USER_CONFIG.opencode.capability,
      billing: input.opencode?.billing ?? DEFAULT_USER_CONFIG.opencode.billing,
      ...(opencodeProxy ? { proxy: opencodeProxy } : {}),
    },
    webui: {
      enabled: input.webui?.enabled ?? DEFAULT_USER_CONFIG.webui.enabled,
      port: input.webui?.port ?? DEFAULT_USER_CONFIG.webui.port,
    },
    telegram: {
      enabled: input.telegram?.enabled ?? DEFAULT_USER_CONFIG.telegram.enabled,
      botToken: trimOrEmpty(
        input.telegram?.botToken ?? DEFAULT_USER_CONFIG.telegram.botToken,
      ),
      chatId: trimOrEmpty(
        input.telegram?.chatId ?? DEFAULT_USER_CONFIG.telegram.chatId,
      ),
      apiRoot: telegramApiRoot ?? DEFAULT_USER_CONFIG.telegram.apiRoot,
      proxy: trimOrEmpty(
        input.telegram?.proxy ?? DEFAULT_USER_CONFIG.telegram.proxy,
      ),
    },
    feishu: {
      enabled: input.feishu?.enabled ?? DEFAULT_USER_CONFIG.feishu.enabled,
      appId: trimOrEmpty(
        input.feishu?.appId ?? DEFAULT_USER_CONFIG.feishu.appId,
      ),
      appSecret: trimOrEmpty(
        input.feishu?.appSecret ?? DEFAULT_USER_CONFIG.feishu.appSecret,
      ),
      chatId: trimOrEmpty(
        input.feishu?.chatId ?? DEFAULT_USER_CONFIG.feishu.chatId,
      ),
    },
  }
}

const parseConfigInput = (
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

export type LoadDefaultConfigFromTomlOptions = {
  onUnknownKeys?: (keys: readonly string[]) => void
}

export const loadDefaultConfigFromToml = (
  path = DEFAULT_CONFIG_PATH,
  options: LoadDefaultConfigFromTomlOptions = {},
): UserConfigDefaults => {
  const source = readConfigSourceOrTemplate(path)
  const parsed = parseConfigInput(source)
  if (parsed.unknownKeys.length > 0) options.onUnknownKeys?.(parsed.unknownKeys)
  return parsed.config
}
