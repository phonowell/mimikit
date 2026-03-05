import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { qqConfigSchema } from './channels/qq/config.js'

import type { QqConfig } from './channels/qq/config.js'

const modelReasoningEffortSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])

const userConfigInputSchema = z
  .object({
    manager: z
      .object({
        model: z.string().min(1).optional(),
        modelReasoningEffort: modelReasoningEffortSchema.optional(),
        provider: z
          .object({
            baseUrl: z.string().optional(),
            apiKey: z.string().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    worker: z
      .object({
        maxConcurrent: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional(),
        model: z.string().min(1).optional(),
        modelReasoningEffort: modelReasoningEffortSchema.optional(),
      })
      .strict()
      .optional(),
    qq: qqConfigSchema.partial().strict().optional(),
  })
  .strict()

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
  qq: QqConfig
}

const DEFAULT_USER_CONFIG: UserConfigDefaults = {
  manager: {
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
    provider: {},
  },
  worker: {
    maxConcurrent: 3,
    timeoutMs: 600000,
    model: 'gpt-5.3-codex-high',
    modelReasoningEffort: 'high',
  },
  qq: {
    enabled: false,
    appId: '',
    appSecret: '',
    apiBase: 'https://api.sgroup.qq.com',
    callbackPath: '/api/qq/events',
    verifySign: true,
    clockSkewMs: 300000,
  },
}

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
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

const parseConfigInput = (source: string): UserConfigDefaults => {
  const parsed = (parseYaml(source) ?? {}) as unknown
  const validated = userConfigInputSchema.safeParse(parsed)
  if (!validated.success) {
    const issues = validated.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ')
    throw new Error(`[config] invalid yaml defaults: ${issues}`)
  }

  const input = validated.data
  const managerProvider = input.manager?.provider
  const baseUrl = trimToUndefined(managerProvider?.baseUrl)
  const apiKey = trimToUndefined(managerProvider?.apiKey)

  return {
    manager: {
      model: input.manager?.model ?? DEFAULT_USER_CONFIG.manager.model,
      modelReasoningEffort:
        input.manager?.modelReasoningEffort ??
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
    qq: {
      enabled: input.qq?.enabled ?? DEFAULT_USER_CONFIG.qq.enabled,
      appId: input.qq?.appId ?? DEFAULT_USER_CONFIG.qq.appId,
      appSecret: input.qq?.appSecret ?? DEFAULT_USER_CONFIG.qq.appSecret,
      apiBase: input.qq?.apiBase ?? DEFAULT_USER_CONFIG.qq.apiBase,
      callbackPath:
        input.qq?.callbackPath ?? DEFAULT_USER_CONFIG.qq.callbackPath,
      verifySign: input.qq?.verifySign ?? DEFAULT_USER_CONFIG.qq.verifySign,
      clockSkewMs: input.qq?.clockSkewMs ?? DEFAULT_USER_CONFIG.qq.clockSkewMs,
    },
  }
}

export const loadDefaultConfigFromYaml = (
  path = DEFAULT_CONFIG_PATH,
): UserConfigDefaults => {
  const source = readOrCreateConfigSource(path)
  return parseConfigInput(source)
}
