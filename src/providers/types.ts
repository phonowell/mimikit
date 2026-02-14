import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type ProviderKind = 'openai-chat' | 'codex-sdk' | 'opencode'

export type ProviderResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
}

export type UsageListener = (usage: TokenUsage) => void
export type TextDeltaListener = (delta: string) => void

export type OpenAiChatProviderRequest = {
  provider: 'openai-chat'
  prompt: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  seed?: number
  temperature?: number
  onTextDelta?: TextDeltaListener
  onUsage?: UsageListener
}

export type CodexSdkProviderRequest = {
  provider: 'codex-sdk'
  role: 'manager' | 'worker'
  prompt: string
  workDir: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  threadId?: string | null
  outputSchema?: unknown
  logPath?: string
  logContext?: Record<string, unknown>
  abortSignal?: AbortSignal
  onUsage?: UsageListener
}

export type OpencodeProviderRequest = {
  provider: 'opencode'
  role: 'manager' | 'worker'
  prompt: string
  workDir: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  threadId?: string | null
  abortSignal?: AbortSignal
  onUsage?: UsageListener
}

export type ProviderRequest =
  | OpenAiChatProviderRequest
  | CodexSdkProviderRequest
  | OpencodeProviderRequest

export type Provider<TRequest extends ProviderRequest> = {
  id: TRequest['provider']
  run: (request: TRequest) => Promise<ProviderResult>
}
