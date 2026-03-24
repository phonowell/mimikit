import { nowIso } from '../../../foundation/shared/utils.js'
import { runSerialized } from '../../../persistence/storage/serialized-lock.js'
import {
  readMemoryEntries,
  writeMemoryEntries,
} from '../../../work/memory/entry-codec.js'
import { type MemoryEntry } from '../../../work/memory/entry-types.js'
import {
  buildMemoryEntryId,
  normalizeInline,
  normalizeText,
  truncateContent,
  truncateTitle,
} from '../../../work/memory/entry-utils.js'
import { type MemoryScoreContext } from '../entry-score.js'

import { enforceStorageBudget } from './apply-patch-budget.js'

import type { MemoryEvidenceEntry } from './types.js'

const normalizeEvidenceIds = (
  value: string[] | undefined,
): string[] | undefined => {
  const list = (value ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (list.length === 0) return undefined
  return [...new Set(list)]
}

const normalizePatchEntry = (
  entry: MemoryEvidenceEntry,
):
  | {
      id: string
      title: string
      content: string
      evidenceIds?: string[]
    }
  | undefined => {
  const title = truncateTitle(normalizeInline(entry.title) || 'Memory')
  const content = truncateContent(normalizeText(entry.content))
  if (!content) return undefined
  const evidenceIds = normalizeEvidenceIds(entry.evidenceIds)
  return {
    id: buildMemoryEntryId(`${title}\n${content}`),
    title,
    content,
    ...(evidenceIds ? { evidenceIds } : {}),
  }
}

const buildContentKey = (value: string): string =>
  normalizeText(value).toLowerCase()

export type ApplyMemoryPatchInput = {
  entries: MemoryEvidenceEntry[]
  deleteEntryIds: string[]
  scoreContext: MemoryScoreContext
}

export type ApplyMemoryPatchResult = {
  written: number
  skipped: number
  deleted: number
  droppedByCompression: number
}

export const applyMemoryPatch = (
  memoryPath: string,
  input: ApplyMemoryPatchInput,
): Promise<ApplyMemoryPatchResult> =>
  runSerialized(memoryPath, async () => {
    const current = await readMemoryEntries(memoryPath)
    const deleteSet = new Set(input.deleteEntryIds)
    const afterDelete = current.filter((entry) => !deleteSet.has(entry.id))
    const deleted = current.length - afterDelete.length

    const next = [...afterDelete]
    const now = nowIso()
    const byId = new Map(next.map((entry, index) => [entry.id, index]))
    const byContent = new Map(
      next.map((entry, index) => [buildContentKey(entry.content), index]),
    )

    let written = 0
    let skipped = 0
    const seenPatchKeys = new Set<string>()
    for (const rawEntry of input.entries) {
      const normalized = normalizePatchEntry(rawEntry)
      if (!normalized) {
        skipped += 1
        continue
      }
      const patchKey = `${normalized.id}\n${buildContentKey(normalized.content)}`
      if (seenPatchKeys.has(patchKey)) {
        skipped += 1
        continue
      }
      seenPatchKeys.add(patchKey)

      const contentKey = buildContentKey(normalized.content)
      const index = byId.get(normalized.id) ?? byContent.get(contentKey)
      if (index === undefined) {
        const created: MemoryEntry = {
          id: normalized.id,
          title: normalized.title,
          content: normalized.content,
          updatedAt: now,
          source: 'refresh',
          ...(normalized.evidenceIds
            ? { evidenceIds: normalized.evidenceIds }
            : {}),
        }
        next.push(created)
        byId.set(created.id, next.length - 1)
        byContent.set(contentKey, next.length - 1)
        written += 1
        continue
      }

      const currentEntry = next[index]
      if (!currentEntry) {
        skipped += 1
        continue
      }
      const mergedEvidence = normalizeEvidenceIds([
        ...(currentEntry.evidenceIds ?? []),
        ...(normalized.evidenceIds ?? []),
      ])
      const evidenceChanged =
        (mergedEvidence?.join(',') ?? '') !==
        (currentEntry.evidenceIds?.join(',') ?? '')
      const changed =
        currentEntry.title !== normalized.title ||
        currentEntry.content !== normalized.content ||
        currentEntry.source !== 'refresh' ||
        evidenceChanged
      if (!changed) {
        skipped += 1
        continue
      }
      const updated: MemoryEntry = {
        ...currentEntry,
        title: normalized.title,
        content: normalized.content,
        updatedAt: now,
        source: 'refresh',
        ...(mergedEvidence ? { evidenceIds: mergedEvidence } : {}),
      }
      next[index] = updated
      byContent.set(contentKey, index)
      written += 1
    }

    const compressed = enforceStorageBudget({
      entries: next,
      context: input.scoreContext,
    })
    const { entries, droppedByCompression } = compressed
    if (written <= 0 && deleted <= 0 && droppedByCompression <= 0)
      return { written: 0, skipped, deleted: 0, droppedByCompression: 0 }

    await writeMemoryEntries(memoryPath, entries)
    return { written, skipped, deleted, droppedByCompression }
  })
