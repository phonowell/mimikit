import type { Task, TokenUsage } from '../../foundation/types/index.js'
import type { TraceArchiveEntry } from '../../persistence/storage/traces-archive.js'

export type ProviderResult = {
  output: string
  outputJson?: unknown
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}

export type RunModelInput = {
  prompt: string
  threadId?: string | null
  onTurnStarted?: () => void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}

export type RunLoopParams = {
  stateDir: string
  task: Task
  prompt: string
  initialThreadId?: string | null
  archiveBase: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>
  runModel: (input: RunModelInput) => Promise<ProviderResult>
  onSessionId?: (sessionId: string) => Promise<void> | void
  onTurnStarted?: () => void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
  abortSignal?: AbortSignal
}
