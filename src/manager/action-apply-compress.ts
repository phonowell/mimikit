import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'
import { runWithProvider } from '../providers/registry.js'

import { compressContextSchema } from './action-apply-schema.js'
import { resolveManagerTimeoutMs } from './runner-budget.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const MAX_COMPRESSED_CONTEXT_CHARS = 4_000

const normalizeCompressedContext = (value: string): string => {
  const normalized = value.trim().replace(/\r\n/g, '\n')
  if (normalized.length <= MAX_COMPRESSED_CONTEXT_CHARS) return normalized
  return `${normalized.slice(0, MAX_COMPRESSED_CONTEXT_CHARS - 1).trimEnd()}…`
}

export const applyCompressContext = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = compressContextSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const threadId = runtime.plannerSessionId?.trim()
  if (!threadId) return
  const prompt = (await loadPromptFile('manager', 'compress-context')).trim()
  if (!prompt)
    throw new Error('missing_prompt_template:manager/compress-context.md')
  const timeoutMs = resolveManagerTimeoutMs(prompt)
  const result = await runWithProvider({
    provider: 'codex-sdk',
    role: 'manager',
    prompt,
    workDir: runtime.config.workDir,
    timeoutMs,
    model: runtime.config.manager.model,
    modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
    threadId,
    logPath: runtime.paths.log,
    logContext: {
      action: 'compress_context',
    },
  })
  const compressed = normalizeCompressedContext(result.output)
  if (!compressed) throw new Error('compress_context_empty_summary')
  runtime.managerCompressedContext = compressed
  delete runtime.plannerSessionId
  await persistRuntimeState(runtime)
}
