import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type ProviderKind = 'codex-sdk'

export type ProviderResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
}

export type UsageListener = (usage: TokenUsage) => void
export type TextDeltaListener = (delta: string) => void

type ProviderRequestBase = {
  role: 'manager' | 'worker'
  prompt: string
  workDir: string
  timeoutMs: number
  model?: string
  threadId?: string | null
  abortSignal?: AbortSignal
  onUsage?: UsageListener
}

export type CodexSdkProviderRequest = ProviderRequestBase & {
  provider: 'codex-sdk'
  modelReasoningEffort?: ModelReasoningEffort
  outputSchema?: unknown
  logPath?: string
  logContext?: Record<string, unknown>
  onTextDelta?: TextDeltaListener
}

export type ProviderRequest = CodexSdkProviderRequest

export type Provider<TRequest extends ProviderRequest> = {
  id: TRequest['provider']
  run: (request: TRequest) => Promise<ProviderResult>
}
