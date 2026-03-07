import { stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'

import { runManagerLlmCall } from '../../manager/manager-llm-call.js'
import { renderPromptTemplate } from '../../prompts/format.js'
import { loadPromptSource } from '../../prompts/prompt-loader.js'
import { parseMemoryEntries } from '../entry-codec.js'

import { parseStageJson } from './stage-json.js'

import type {
  MemoryRefreshPayload,
  MemoryRefreshStageSummary,
  MemoryRefreshSubprocessResult,
} from './types.js'

const MAX_SINGLE_CALL_ENTRIES = 60
const MAX_DELETE_ENTRY_IDS = 120

const memoryEntryIdSchema = z
  .string()
  .trim()
  .regex(/^memory-[a-z0-9._-]+$/)

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
    delete_entry_ids: z
      .array(memoryEntryIdSchema)
      .max(MAX_DELETE_ENTRY_IDS)
      .optional(),
    entries: z.array(entrySchema).max(MAX_SINGLE_CALL_ENTRIES).optional(),
  })
  .strict()

const buildPrompt = async (payload: MemoryRefreshPayload): Promise<string> => {
  const source = await loadPromptSource('manager/memory-refresh-single-call.md')
  const template = source.template.trim()
  if (!template) {
    throw new Error(
      'missing_prompt_template:manager/memory-refresh-single-call.md',
    )
  }

  return renderPromptTemplate(
    template,
    {
      input_yaml: stringifyYaml(payload, undefined, {
        lineWidth: 0,
        indent: 2,
        singleQuote: false,
      }).trimEnd(),
    },
    source.path,
  )
}

const toStageSummary = (
  summary: z.infer<typeof stageSummarySchema>,
): MemoryRefreshStageSummary => ({
  mode: summary.mode,
  reason: summary.reason,
})

const collectAllowedEvidenceIds = (
  payload: MemoryRefreshPayload,
): Set<string> => {
  const ids = new Set<string>()
  for (const item of payload.signals) ids.add(item.id)
  for (const item of payload.tasks) ids.add(item.id)
  for (const item of payload.plans) ids.add(item.id)
  return ids
}

const collectAllowedDeleteEntryIds = (
  payload: MemoryRefreshPayload,
): Set<string> =>
  new Set(parseMemoryEntries(payload.memoryMarkdown).map((item) => item.id))

const sanitizeEntries = (
  payload: MemoryRefreshPayload,
  parsed: z.infer<typeof singleCallOutputSchema>,
): {
  entries: MemoryRefreshSubprocessResult['entries']
  deleteEntryIds: MemoryRefreshSubprocessResult['deleteEntryIds']
  droppedInvalidEvidence: boolean
  droppedInvalidDeleteEntryIds: boolean
} => {
  if (parsed.mode === 'noop') {
    return {
      entries: [],
      deleteEntryIds: [],
      droppedInvalidEvidence: false,
      droppedInvalidDeleteEntryIds: false,
    }
  }
  const allowedEvidenceIds = collectAllowedEvidenceIds(payload)
  const allowedDeleteEntryIds = collectAllowedDeleteEntryIds(payload)
  const sanitized: MemoryRefreshSubprocessResult['entries'] = []
  const deleteEntryIds: string[] = []
  let droppedInvalidEvidence = false
  let droppedInvalidDeleteEntryIds = false
  for (const id of parsed.delete_entry_ids ?? []) {
    if (!allowedDeleteEntryIds.has(id)) {
      droppedInvalidDeleteEntryIds = true
      continue
    }
    if (!deleteEntryIds.includes(id)) deleteEntryIds.push(id)
  }
  for (const item of parsed.entries ?? []) {
    const evidenceIds = item.evidence_ids ?? []
    if (evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      droppedInvalidEvidence = true
      continue
    }
    sanitized.push({
      title: item.title,
      content: item.content,
      evidenceIds,
    })
  }
  return {
    entries: sanitized,
    deleteEntryIds,
    droppedInvalidEvidence,
    droppedInvalidDeleteEntryIds,
  }
}

export const runMemoryRefreshSingleCall = async (params: {
  payload: MemoryRefreshPayload
}): Promise<MemoryRefreshSubprocessResult> => {
  const prompt = await buildPrompt(params.payload)
  const result = await runManagerLlmCall({
    prompt,
    workDir: params.payload.workDir,
    model: params.payload.model,
    ...(params.payload.baseUrl ? { baseUrl: params.payload.baseUrl } : {}),
    ...(params.payload.apiKey ? { apiKey: params.payload.apiKey } : {}),
    ...(params.payload.proxy ? { proxy: params.payload.proxy } : {}),
    ...(params.payload.modelReasoningEffort
      ? { modelReasoningEffort: params.payload.modelReasoningEffort }
      : {}),
  })
  const parsed = parseStageJson(
    result.output,
    singleCallOutputSchema,
    'single_call',
  )
  const sanitized = sanitizeEntries(params.payload, parsed)
  const { entries, deleteEntryIds } = sanitized
  const hasPatch =
    parsed.mode === 'patch' && (entries.length > 0 || deleteEntryIds.length > 0)
  const mode = hasPatch ? 'patch' : 'noop'
  const reason = (() => {
    if (parsed.mode !== 'patch' || hasPatch) return parsed.reason
    if (sanitized.droppedInvalidEvidence) return 'invalid_evidence_ids'
    if (sanitized.droppedInvalidDeleteEntryIds)
      return 'invalid_delete_entry_ids'
    return 'empty_patch'
  })()
  const compress =
    parsed.mode === 'patch' && !hasPatch
      ? { mode: 'noop' as const, reason }
      : toStageSummary(parsed.compress)
  return {
    mode,
    reason,
    entries,
    deleteEntryIds,
    harvest: toStageSummary(parsed.harvest),
    curate: toStageSummary(parsed.curate),
    compress,
  }
}
