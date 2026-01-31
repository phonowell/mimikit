import { execCodex } from '../codex.js'

import type { TokenUsage } from '../types/usage.js'

export type RunOptions = {
  prompt: string
  workDir: string
  model?: string
  timeoutMs: number
  allowShell: boolean
}

export type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

export const runCodex = async (options: RunOptions): Promise<RunResult> => {
  const startedAt = Date.now()
  const result = await execCodex({
    prompt: options.prompt,
    workDir: options.workDir,
    model: options.model,
    timeout: options.timeoutMs,
    allowShell: options.allowShell,
  })
  const response: RunResult = {
    output: result.output,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  }
  if (result.usage !== undefined) response.usage = result.usage
  return response
}
