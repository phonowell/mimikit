import { Codex } from '@openai/codex-sdk'

import type { TokenUsage } from '../types/usage.js'

type SdkRole = 'teller' | 'planner' | 'worker'

type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

const codex = new Codex()

const normalizeUsage = (
  usage: { input_tokens: number; output_tokens: number } | null,
): TokenUsage | undefined => {
  if (!usage) return undefined
  const input = usage.input_tokens
  const output = usage.output_tokens
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined
  const result: TokenUsage = {}
  if (Number.isFinite(input)) result.input = input
  if (Number.isFinite(output)) result.output = output
  if (Number.isFinite(input) && Number.isFinite(output))
    result.total = input + output
  return result
}

export const runCodexSdk = async (params: {
  role: SdkRole
  prompt: string
  workDir: string
  model?: string
  timeoutMs: number
  outputSchema?: unknown
}): Promise<RunResult> => {
  const threadOptions = {
    workingDirectory: params.workDir,
    ...(params.model ? { model: params.model } : {}),
    sandboxMode:
      params.role === 'worker'
        ? ('danger-full-access' as const)
        : ('read-only' as const),
    approvalPolicy: 'never' as const,
  }

  const thread = codex.startThread(threadOptions)
  const controller = params.timeoutMs > 0 ? new AbortController() : null
  const timer =
    controller && params.timeoutMs > 0
      ? setTimeout(() => controller.abort(), params.timeoutMs)
      : null
  const startedAt = Date.now()
  try {
    const turn = await thread.run(params.prompt, {
      ...(params.outputSchema ? { outputSchema: params.outputSchema } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    })
    const output = turn.finalResponse
    const usage = normalizeUsage(turn.usage)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return { output, elapsedMs, ...(usage ? { usage } : {}) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
