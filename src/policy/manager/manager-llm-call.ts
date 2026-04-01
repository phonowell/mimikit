import pRetry from 'p-retry'

import { runWithProvider } from '../../execution/providers/registry.js'
import { readProviderThreadId } from '../../execution/providers/thread-id.js'
import { stripUndefined } from '../../foundation/shared/utils.js'
import {
  attachLogDiagnostics,
  createProviderCallId,
} from '../../persistence/log/diagnostics.js'

import {
  attachManagerAutoRetryMeta,
  isManagerRetryableError,
  MANAGER_PROVIDER,
  type ManagerAutoRetryMeta,
  readManagerAutoRetryMeta,
  resolveManagerTimeoutMs,
} from './manager-llm-call-shared.js'

import type { ProviderPromptSegment } from '../../execution/providers/types.js'
import type { TokenUsage } from '../../foundation/types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export { readManagerAutoRetryMeta }
export type { ManagerAutoRetryMeta }

export const runManagerLlmCall = async (params: {
  prompt: string
  promptSegments?: ProviderPromptSegment[]
  outputSchema?: unknown
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
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
  logPath?: string
  logContext?: Record<string, unknown>
}): Promise<{
  prompt: string
  output: string
  outputJson?: unknown
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
  providerCallId?: string
  attempt?: number
}> => {
  const managerBaseUrl = params.baseUrl?.trim()
  const managerApiKey = params.apiKey?.trim()
  const managerProxy = params.proxy?.trim()
  const managerModelReasoningEffort = params.modelReasoningEffort
  const timeoutMs = resolveManagerTimeoutMs(params.prompt)
  const maxAttempts = Math.max(0, params.retry?.maxAttempts ?? 0)
  const backoffMs = Math.max(0, params.retry?.backoffMs ?? 0)
  let autoRetryAttempts = 0
  let lastProviderCallId: string | undefined
  let lastAttempt = 0

  try {
    const result = await pRetry(
      () => {
        lastAttempt += 1
        lastProviderCallId = createProviderCallId()
        return runWithProvider({
          provider: MANAGER_PROVIDER,
          role: 'manager',
          prompt: params.prompt,
          ...(params.promptSegments
            ? { promptSegments: params.promptSegments }
            : {}),
          ...(params.outputSchema ? { outputSchema: params.outputSchema } : {}),
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
          ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
          ...(params.onUsage ? { onUsage: params.onUsage } : {}),
          ...(params.logPath ? { logPath: params.logPath } : {}),
          logContext: stripUndefined({
            ...(params.logContext ?? {}),
            providerCallId: lastProviderCallId,
            attempt: lastAttempt,
          }),
        })
      },
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
      ...(lastProviderCallId ? { providerCallId: lastProviderCallId } : {}),
      ...(lastAttempt > 0 ? { attempt: lastAttempt } : {}),
    }
  } catch (error) {
    const baseError = error instanceof Error ? error : new Error(String(error))
    throw attachManagerAutoRetryMeta(
      attachLogDiagnostics(baseError, {
        ...(lastProviderCallId ? { providerCallId: lastProviderCallId } : {}),
        ...(lastAttempt > 0 ? { attempt: lastAttempt } : {}),
        ...(readProviderThreadId(error)
          ? { threadId: readProviderThreadId(error) as string }
          : {}),
      }),
      {
        autoRetryAttempts,
        autoRetryMaxAttempts: maxAttempts,
        autoRetryState: isManagerRetryableError(error)
          ? 'exhausted'
          : 'not_retryable',
        autoRetryStrategy: 'reuse_worker_retry_config',
      },
    )
  }
}
