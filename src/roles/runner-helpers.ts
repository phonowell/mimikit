import {
  appendLlmArchive,
  type LlmArchiveEntry,
} from '../storage/llm-archive.js'

import type { TokenUsage } from '../types/index.js'

const readEnvOptional = (key: string): string | undefined => {
  const raw = process.env[key]
  const trimmed = raw?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const DEFAULT_MANAGER_FALLBACK_MODEL = readEnvOptional(
  'MIMIKIT_FALLBACK_MODEL',
)

export const normalizeOptional = (
  value?: string | null,
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const withSampling = (params: {
  seed?: number
  temperature?: number
}): { seed?: number; temperature?: number } => ({
  ...(params.seed !== undefined ? { seed: params.seed } : {}),
  ...(params.temperature !== undefined
    ? { temperature: params.temperature }
    : {}),
})

export const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err))

export const archiveManagerResult = (
  stateDir: string,
  base: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: {
    output: string
    ok: boolean
    elapsedMs?: number
    usage?: TokenUsage
    error?: string
    errorName?: string
  },
) =>
  appendLlmArchive(stateDir, {
    ...base,
    prompt,
    output: result.output,
    ok: result.ok,
    ...(result.elapsedMs !== undefined ? { elapsedMs: result.elapsedMs } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorName ? { errorName: result.errorName } : {}),
  })
