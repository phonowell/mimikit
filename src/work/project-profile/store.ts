import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { nowIso } from '../../foundation/shared/utils.js'
import { runSerialized } from '../../persistence/storage/serialized-lock.js'

import {
  formatProjectProfileEntriesMarkdown,
  readProjectProfileEntries,
  writeProjectProfileEntries,
} from './entry-codec.js'
import {
  PROJECT_PROFILE_ENTRY_ID_PREFIX,
  type ProjectProfileEntry,
  type RememberProjectProfileInput,
  type RememberProjectProfileResult,
} from './entry-types.js'

const normalizeInline = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const normalizeText = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const buildEntryId = (content: string): string =>
  `${PROJECT_PROFILE_ENTRY_ID_PREFIX}${createHash('sha1').update(content).digest('hex').slice(0, 12)}`

const sortByUpdatedAtDesc = (
  entries: ProjectProfileEntry[],
): ProjectProfileEntry[] =>
  [...entries].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt)
      return right.updatedAt.localeCompare(left.updatedAt)
    return left.id.localeCompare(right.id)
  })

export const resolveProjectProfilePath = (
  stateDir: string,
  worktree: string,
): string => {
  const normalizedWorktree = worktree.trim() || 'unknown-worktree'
  const fileId = createHash('sha1')
    .update(normalizedWorktree)
    .digest('hex')
    .slice(0, 12)
  return join(
    stateDir,
    'memory',
    'project-profiles',
    `project-profile-${fileId}.md`,
  )
}

export const formatProjectProfilePrompt = (
  entries: ProjectProfileEntry[],
): string =>
  entries
    .map((entry) =>
      entry.sourceQuote
        ? `- ${entry.content}\n  source_quote: ${entry.sourceQuote}`
        : `- ${entry.content}`,
    )
    .join('\n')

export const rememberProjectProfileEntry = (
  profilePath: string,
  input: RememberProjectProfileInput,
): Promise<RememberProjectProfileResult> =>
  runSerialized(profilePath, async () => {
    const content = normalizeText(input.content)
    const sourceInputId = normalizeInline(input.sourceInputId)
    const sourceQuote = normalizeInline(input.sourceQuote ?? '')
    const entries = await readProjectProfileEntries(profilePath)
    const normalizedContent = normalizeInline(content).toLowerCase()
    const existingIndex = entries.findIndex(
      (entry) =>
        normalizeInline(entry.content).toLowerCase() === normalizedContent,
    )
    if (existingIndex < 0) {
      const entryId = buildEntryId(normalizedContent)
      const nextEntry: ProjectProfileEntry = {
        id: entryId,
        content,
        sourceInputId,
        sourceQuote,
        updatedAt: nowIso(),
      }
      await writeProjectProfileEntries(
        profilePath,
        sortByUpdatedAtDesc([nextEntry, ...entries]),
      )
      return {
        entryId,
        ref: `project_profile:entry:${entryId}`,
        operation: 'created',
        contentChars: content.length,
      }
    }

    const current = entries[existingIndex]
    if (
      current?.sourceInputId === sourceInputId &&
      (current.sourceQuote ?? '') === sourceQuote
    ) {
      return {
        entryId: current.id,
        ref: `project_profile:entry:${current.id}`,
        operation: 'noop',
        contentChars: content.length,
      }
    }

    if (!current)
      throw new Error('project_profile_entry_not_found_after_lookup')
    const updatedBase = {
      ...current,
      sourceInputId,
      updatedAt: nowIso(),
    }
    const updated: ProjectProfileEntry = sourceQuote
      ? { ...updatedBase, sourceQuote }
      : updatedBase
    const nextEntries = [...entries]
    nextEntries[existingIndex] = updated
    await writeProjectProfileEntries(
      profilePath,
      sortByUpdatedAtDesc(nextEntries),
    )
    return {
      entryId: updated.id,
      ref: `project_profile:entry:${updated.id}`,
      operation: 'updated',
      contentChars: content.length,
    }
  })

export {
  formatProjectProfileEntriesMarkdown,
  readProjectProfileEntries,
  writeProjectProfileEntries,
}
export type {
  ProjectProfileEntry,
  RememberProjectProfileInput,
  RememberProjectProfileResult,
}
