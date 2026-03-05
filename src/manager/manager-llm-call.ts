import { runWithProvider } from '../providers/registry.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500

export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000
const MANAGER_PROVIDER = 'openai-responses' as const

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
  workDir: string
  model?: string
  managerProvider?: {
    baseUrl?: string | undefined
    apiKey?: string | undefined
    modelReasoningEffort?: ModelReasoningEffort | undefined
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
  const managerBaseUrl = params.managerProvider?.baseUrl?.trim()
  const managerApiKey = params.managerProvider?.apiKey?.trim()
  const managerModelReasoningEffort =
    params.managerProvider?.modelReasoningEffort
  const timeoutMs = resolveManagerTimeoutMs(params.prompt)
  const result = await runWithProvider({
    provider: MANAGER_PROVIDER,
    role: 'manager',
    prompt: params.prompt,
    workDir: params.workDir,
    timeoutMs,
    ...(managerBaseUrl ? { baseUrl: managerBaseUrl } : {}),
    ...(managerApiKey ? { apiKey: managerApiKey } : {}),
    ...(managerModelReasoningEffort
      ? { modelReasoningEffort: managerModelReasoningEffort }
      : {}),
    ...(params.model?.trim() ? { model: params.model.trim() } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.logPath ? { logPath: params.logPath } : {}),
    ...(params.logContext ? { logContext: params.logContext } : {}),
  })

  return {
    ...result,
    prompt: params.prompt,
  }
}
