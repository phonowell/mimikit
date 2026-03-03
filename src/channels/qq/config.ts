import { z } from 'zod'

export const qqConfigSchema = z
  .object({
    enabled: z.boolean(),
    appId: z.string(),
    appSecret: z.string(),
    apiBase: z.string().min(1),
    callbackPath: z.string().min(1),
    verifySign: z.boolean(),
    clockSkewMs: z.number().int().nonnegative(),
  })
  .strict()

export type QqConfig = z.infer<typeof qqConfigSchema>

const parseEnvBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === '1' || normalized === 'true' || normalized === 'yes')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no')
    return false
  console.warn('[cli] invalid QQ_CHANNEL_ENABLED:', value)
  return undefined
}

export const applyQqEnvOverrides = (config: QqConfig): void => {
  const enabled = parseEnvBoolean(process.env.QQ_CHANNEL_ENABLED)
  if (enabled !== undefined) config.enabled = enabled
  const appId = process.env.QQ_APP_ID?.trim()
  if (appId) config.appId = appId
  const appSecret = process.env.QQ_CLIENT_SECRET?.trim()
  if (appSecret) config.appSecret = appSecret
  const apiBase = process.env.QQ_API_BASE?.trim()
  if (apiBase) config.apiBase = apiBase
  const callbackPath = process.env.QQ_CALLBACK_PATH?.trim()
  if (callbackPath) config.callbackPath = callbackPath
}

export const assertEnabledQqConfig = (config: QqConfig): void => {
  if (!config.appId.trim() || !config.appSecret.trim()) {
    throw new Error(
      '[config] qq.enabled=true requires qq.appId and qq.appSecret',
    )
  }
}
