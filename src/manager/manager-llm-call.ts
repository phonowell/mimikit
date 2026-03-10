import pRetry from 'p-retry'

import { ProviderError } from '../providers/provider-error.js'
import { runWithProvider } from '../providers/registry.js'

import type { ProviderPromptSegment } from '../providers/types.js'
import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500

export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000
const MANAGER_PROVIDER = 'openai-responses' as const
const MANAGER_AUTO_RETRY_META_SYMBOL = Symbol.for(
  'mimikit.manager_auto_retry_meta',
)

export type ManagerAutoRetryMeta = {
  autoRetryAttempts: number
  autoRetryMaxAttempts: number
  autoRetryState: 'exhausted' | 'not_retryable'
  autoRetryStrategy: string
}

const isManagerRetryableError = (error: unknown): boolean =>
  error instanceof ProviderError && error.retryable

const attachManagerAutoRetryMeta = <TError extends Error>(
  error: TError,
  meta: ManagerAutoRetryMeta,
): TError => {
  Object.defineProperty(error, MANAGER_AUTO_RETRY_META_SYMBOL, {
    value: meta,
    configurable: true,
    enumerable: false,
    writable: false,
  })
  return error
}

export const readManagerAutoRetryMeta = (
  error: unknown,
): ManagerAutoRetryMeta | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const meta = (error as Record<PropertyKey, unknown>)[
    MANAGER_AUTO_RETRY_META_SYMBOL
  ]
  if (!meta || typeof meta !== 'object') return undefined
  const record = meta as Record<string, unknown>
  const {
    autoRetryAttempts,
    autoRetryMaxAttempts,
    autoRetryState,
    autoRetryStrategy,
  } = record
  if (
    typeof autoRetryAttempts !== 'number' ||
    typeof autoRetryMaxAttempts !== 'number' ||
    (autoRetryState !== 'exhausted' && autoRetryState !== 'not_retryable') ||
    typeof autoRetryStrategy !== 'string'
  )
    return undefined
  return {
    autoRetryAttempts,
    autoRetryMaxAttempts,
    autoRetryState,
    autoRetryStrategy,
  }
}

export const resolveManagerTimeoutMs = (prompt: string): number => {
  const promptBytes = Buffer.byteLength(prompt, 'utf8')
  const stepCount = Math.ceil(promptBytes / BYTE_STEP)
  const computed = MIN_MANAGER_TIMEOUT_MS + stepCount * TIMEOUT_STEP_MS
  return Math.max(
    MIN_MANAGER_TIMEOUT_MS,
    Math.min(MAX_MANAGER_TIMEOUT_MS, computed),
  )
}

export const runManagerLlmCall = async (params: {
  prompt: string
  promptSegments?: ProviderPromptSegment[]
  threadId?: string | null
  workDir: string
  model?: string
  baseUrl?: string | undefined
  apiKey?: string | undefined
  proxy?: string | undefined
  modelReasoningEffort?: ModelReasoningEffort | undefined
  retry?: {
    maxAttempts: number
    backoffMs: number
  }
  onUsage?: (usage: TokenUsage) => void
  logPath?: string
  logContext?: Record<string, unknown>
}): Promise<{
  prompt: string
  output: string
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}> => {
  const managerBaseUrl = params.baseUrl?.trim()
  const managerApiKey = params.apiKey?.trim()
  const managerProxy = params.proxy?.trim()
  const managerModelReasoningEffort = params.modelReasoningEffort
  const timeoutMs = resolveManagerTimeoutMs(params.prompt)
  const maxAttempts = Math.max(0, params.retry?.maxAttempts ?? 0)
  const backoffMs = Math.max(0, params.retry?.backoffMs ?? 0)
  let autoRetryAttempts = 0

  try {
    const result = await pRetry(
      () =>
        runWithProvider({
          provider: MANAGER_PROVIDER,
          role: 'manager',
          prompt: params.prompt,
          ...(params.promptSegments
            ? { promptSegments: params.promptSegments }
            : {}),
          ...(params.threadId ? { threadId: params.threadId } : {}),
          workDir: params.workDir,
          timeoutMs,
          ...(managerBaseUrl ? { baseUrl: managerBaseUrl } : {}),
          ...(managerApiKey ? { apiKey: managerApiKey } : {}),
          ...(managerProxy ? { proxy: managerProxy } : {}),
          ...(managerModelReasoningEffort
            ? { modelReasoningEffort: managerModelReasoningEffort }
            : {}),
          ...(params.model?.trim() ? { model: params.model.trim() } : {}),
          ...(params.onUsage ? { onUsage: params.onUsage } : {}),
          ...(params.logPath ? { logPath: params.logPath } : {}),
          ...(params.logContext ? { logContext: params.logContext } : {}),
        }),
      {
        retries: maxAttempts,
        factor: 1,
        minTimeout: backoffMs,
        maxTimeout: backoffMs,
        randomize: false,
        shouldConsumeRetry: ({ error }) => isManagerRetryableError(error),
        shouldRetry: ({ error }) => isManagerRetryableError(error),
        onFailedAttempt: (attemptError) => {
          if (!isManagerRetryableError(attemptError.error)) return
          if (attemptError.retriesLeft <= 0) return
          autoRetryAttempts += 1
        },
      },
    )

    return {
      ...result,
      prompt: params.prompt,
    }
  } catch (error) {
    const baseError = error instanceof Error ? error : new Error(String(error))
    throw attachManagerAutoRetryMeta(baseError, {
      autoRetryAttempts,
      autoRetryMaxAttempts: maxAttempts,
      autoRetryState: isManagerRetryableError(error)
        ? 'exhausted'
        : 'not_retryable',
      autoRetryStrategy: 'reuse_worker_retry_config',
    })
  }
}
