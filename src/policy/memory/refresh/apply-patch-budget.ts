import { formatMemoryEntriesMarkdown } from '../../../work/memory/entry-codec.js'
import {
  MEMORY_STORAGE_MAX_BYTES,
  type MemoryEntry,
} from '../../../work/memory/entry-types.js'
import {
  type MemoryScoreContext,
  rankMemoryEntries,
  selectScoredMemoryEntries,
} from '../entry-score.js'

const sortByUpdatedAtDesc = (entries: MemoryEntry[]): MemoryEntry[] =>
  [...entries].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt)
      return right.updatedAt.localeCompare(left.updatedAt)
    return left.id.localeCompare(right.id)
  })

const renderStorageEntry = (entry: MemoryEntry): string =>
  formatMemoryEntriesMarkdown([entry]).trim()

export const enforceStorageBudget = (params: {
  entries: MemoryEntry[]
  context: MemoryScoreContext
}): { entries: MemoryEntry[]; droppedByCompression: number } => {
  const ordered = sortByUpdatedAtDesc(params.entries)
  const currentMarkdown = formatMemoryEntriesMarkdown(ordered)
  if (Buffer.byteLength(currentMarkdown, 'utf8') <= MEMORY_STORAGE_MAX_BYTES)
    return { entries: ordered, droppedByCompression: 0 }

  const ranked = rankMemoryEntries({
    entries: ordered,
    context: params.context,
  })
  const selected = selectScoredMemoryEntries({
    rankedEntries: ranked,
    maxBytes: MEMORY_STORAGE_MAX_BYTES,
    render: renderStorageEntry,
  })
  const selectedIds = new Set(selected.map((item) => item.id))
  const retained = ordered.filter((item) => selectedIds.has(item.id))
  return {
    entries: retained,
    droppedByCompression: Math.max(0, ordered.length - retained.length),
  }
}
