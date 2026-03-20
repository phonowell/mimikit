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
  includeRemembered?: boolean
  includeMemory?: boolean
}): MemoryPromptSections => {
  const includeRemembered = params.includeRemembered ?? true
  const includeMemory = params.includeMemory ?? true
  if (!includeRemembered && !includeMemory) {
    return { rememberedMemory: '', memory: '' }
  }

  const rememberedEntries = params.entries.filter(
    (entry) => entry.source === 'remember',
  )
  if (!includeRemembered || rememberedEntries.length === 0) {
    return {
      rememberedMemory: '',
      memory: includeMemory ? buildScoredMemoryPrompt(params) : '',
    }
  }

  const rememberedBudget = Math.min(
    includeMemory
      ? Math.max(
          MIN_REMEMBERED_MEMORY_BYTES,
          Math.floor(params.maxBytes * REMEMBERED_MEMORY_SHARE),
        )
      : params.maxBytes,
    params.maxBytes,
  )
  const rememberedMemory = buildScoredMemoryPrompt({
    entries: rememberedEntries,
    context: params.context,
    maxBytes: rememberedBudget,
  })
  const memory = includeMemory
    ? buildScoredMemoryPrompt({
        entries: params.entries.filter((entry) => entry.source !== 'remember'),
        context: params.context,
        maxBytes: Math.max(0, params.maxBytes - measureBytes(rememberedMemory)),
      })
    : ''

  return {
    rememberedMemory,
    memory,
  }
}
