import type { TraceArchiveEntry } from '../storage/traces-archive.js'
import type { Task, TokenUsage } from '../types/index.js'

export type ProviderResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}

export type RunModelInput = {
  prompt: string
  threadId?: string | null
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}

export type RunLoopParams = {
  stateDir: string
  task: Task
  prompt: string
  initialThreadId?: string | null
  continueTemplate: string
  continueTemplatePath: string
  archiveBase: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>
  runModel: (input: RunModelInput) => Promise<ProviderResult>
  onSessionId?: (sessionId: string) => Promise<void> | void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
  abortSignal?: AbortSignal
  budget?: {
    maxDurationMs?: number
    maxRounds?: number
  }
}
