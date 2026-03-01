import { runWithProvider } from '../providers/registry.js'

import type { TokenUsage } from '../types/index.js'

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500

export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000

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
  onTextDelta?: (delta: string) => void
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
  const timeoutMs = resolveManagerTimeoutMs(params.prompt)
  const result = await runWithProvider({
    provider: 'openai-chat',
    role: 'manager',
    prompt: params.prompt,
    workDir: params.workDir,
    timeoutMs,
    ...(params.model?.trim() ? { model: params.model.trim() } : {}),
    ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.logPath ? { logPath: params.logPath } : {}),
    ...(params.logContext ? { logContext: params.logContext } : {}),
  })

  return {
    ...result,
    prompt: params.prompt,
  }
}
