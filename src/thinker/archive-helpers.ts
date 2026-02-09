import {
  appendLlmArchiveResult,
  type LlmArchiveEntry,
  type LlmArchiveResult,
} from '../storage/llm-archive.js'

const readEnvOptional = (key: string): string | undefined => {
  const raw = process.env[key]
  const trimmed = raw?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const DEFAULT_THINKER_FALLBACK_MODEL = readEnvOptional(
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

export const archiveThinkerResult = (
  stateDir: string,
  base: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: LlmArchiveResult,
) => appendLlmArchiveResult(stateDir, base, prompt, result)
