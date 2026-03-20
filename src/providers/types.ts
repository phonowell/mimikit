import type { TokenUsage } from './token-usage.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type ProviderKind = 'codex-sdk' | 'openai-responses'

export type ProviderResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
}

export type ProviderPromptSegment = {
  text: string
  cacheControl?: 'ephemeral'
}

export type UsageListener = (usage: TokenUsage) => void
export type PartialOutputListener = (output: string) => void

type ProviderRequestBase = {
  role: 'manager' | 'worker'
  runtimeId?: string
  prompt: string
  promptSegments?: ProviderPromptSegment[]
  workDir: string
  timeoutMs: number
  proxy?: string
  model?: string
  threadId?: string | null
  abortSignal?: AbortSignal
  onUsage?: UsageListener
  onPartialOutput?: PartialOutputListener
}

export type OpenAiResponsesProviderRequest = ProviderRequestBase & {
  provider: 'openai-responses'
  baseUrl?: string
  apiKey?: string
  modelReasoningEffort?: ModelReasoningEffort
  outputSchema?: unknown
  logPath?: string
  logContext?: Record<string, unknown>
}

export type CodexSdkProviderRequest = ProviderRequestBase & {
  provider: 'codex-sdk'
  modelReasoningEffort?: ModelReasoningEffort
  outputSchema?: unknown
  logPath?: string
  logContext?: Record<string, unknown>
}

export type ProviderRequest =
  | CodexSdkProviderRequest
  | OpenAiResponsesProviderRequest

export type Provider<TRequest extends ProviderRequest> = {
  id: TRequest['provider']
  run: (request: TRequest) => Promise<ProviderResult>
}
