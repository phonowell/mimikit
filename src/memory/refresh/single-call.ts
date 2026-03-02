import { z } from 'zod'

import { runManagerLlmCall } from '../../manager/manager-llm-call.js'
import { loadPromptFile } from '../../prompts/prompt-loader.js'

import { parseStageJson } from './stage-json.js'

import type {
  MemoryRefreshPayload,
  MemoryRefreshStageSummary,
  MemoryRefreshSubprocessResult,
} from './types.js'

const entrySchema = z
  .object({
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
    evidence_ids: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

const stageSummarySchema = z
  .object({
    mode: z.enum(['patch', 'noop']),
    reason: z.string().trim().min(1),
  })
  .strict()

const singleCallOutputSchema = z
  .object({
    mode: z.enum(['patch', 'noop']),
    reason: z.string().trim().min(1),
    harvest: stageSummarySchema,
    curate: stageSummarySchema,
    compress: stageSummarySchema,
    entries: z.array(entrySchema).max(20).optional(),
  })
  .strict()

const buildPrompt = async (payload: MemoryRefreshPayload): Promise<string> => {
  const template = (
    await loadPromptFile('manager', 'memory-refresh-single-call')
  ).trim()
  if (!template)
    throw new Error('missing_prompt_template:manager/memory-refresh-single-call.md')
  return `${template}\n\n# Input(JSON)\n${JSON.stringify(payload)}`
}

const toStageSummary = (
  summary: z.infer<typeof stageSummarySchema>,
): MemoryRefreshStageSummary => ({
  mode: summary.mode,
  reason: summary.reason,
})

export const runMemoryRefreshSingleCall = async (params: {
  payload: MemoryRefreshPayload
}): Promise<MemoryRefreshSubprocessResult> => {
  const prompt = await buildPrompt(params.payload)
  const result = await runManagerLlmCall({
    prompt,
    workDir: params.payload.workDir,
    model: params.payload.model,
  })
  const parsed = parseStageJson(
    result.output,
    singleCallOutputSchema,
    'single_call',
  )
  const entries =
    parsed.mode === 'noop'
      ? []
      : (parsed.entries ?? []).map((item) => ({
          title: item.title,
          content: item.content,
          evidenceIds: item.evidence_ids ?? [],
        }))
  const mode = parsed.mode === 'patch' && entries.length > 0 ? 'patch' : 'noop'
  const reason =
    parsed.mode === 'patch' && entries.length === 0 ? 'empty_entries' : parsed.reason
  const compress =
    parsed.mode === 'patch' && entries.length === 0
      ? { mode: 'noop' as const, reason: 'empty_entries' }
      : toStageSummary(parsed.compress)
  return {
    mode,
    reason,
    entries,
    harvest: toStageSummary(parsed.harvest),
    curate: toStageSummary(parsed.curate),
    compress,
  }
}
