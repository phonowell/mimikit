import {
  buildScoredMemoryPrompt,
  type MemoryScoreContext,
} from './entry-score.js'

import type { MemoryEntry } from './entry-types.js'

const REMEMBERED_MEMORY_SHARE = 0.5
const MIN_REMEMBERED_MEMORY_BYTES = 256

const measureBytes = (value: string): number => Buffer.byteLength(value, 'utf8')

export type MemoryPromptSections = {
  rememberedMemory: string
  memory: string
}

export const buildMemoryPromptSections = (params: {
  entries: MemoryEntry[]
  context: MemoryScoreContext
  maxBytes: number
}): MemoryPromptSections => {
  const rememberedEntries = params.entries.filter(
    (entry) => entry.source === 'remember',
  )
  if (rememberedEntries.length === 0) {
    return {
      rememberedMemory: '',
      memory: buildScoredMemoryPrompt(params),
    }
  }

  const rememberedBudget = Math.min(
    params.maxBytes,
    Math.max(
      MIN_REMEMBERED_MEMORY_BYTES,
      Math.floor(params.maxBytes * REMEMBERED_MEMORY_SHARE),
    ),
  )
  const rememberedMemory = buildScoredMemoryPrompt({
    entries: rememberedEntries,
    context: params.context,
    maxBytes: rememberedBudget,
  })
  const remainingBytes = Math.max(
    0,
    params.maxBytes - measureBytes(rememberedMemory),
  )
  const memory = buildScoredMemoryPrompt({
    entries: params.entries.filter((entry) => entry.source !== 'remember'),
    context: params.context,
    maxBytes: remainingBytes,
  })

  return {
    rememberedMemory,
    memory,
  }
}
