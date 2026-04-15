import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  normalizeEntryInline,
  normalizeEntryText,
  parseEntryMetaAndContent,
} from '../../foundation/shared/markdown-entry.js'
import { ensureDir } from '../../persistence/fs/paths.js'
import { readTextFileIfExists } from '../../persistence/fs/read-text.js'

import {
  PROJECT_PROFILE_FALLBACK_UPDATED_AT,
  type ProjectProfileEntry,
} from './entry-types.js'

const HEADING_RE =
  /^##\s+\[project-profile-entry\]\s+\(id:(project-profile-[a-z0-9._-]+)\)$/i

const normalizeInline = (value: string): string => normalizeEntryInline(value)

const normalizeText = (value: string): string => normalizeEntryText(value)

const parseMetaAndContent = (
  body: string,
): {
  meta: Map<string, string>
  content: string
} => parseEntryMetaAndContent(body)

const formatEntry = (entry: ProjectProfileEntry): string =>
  [
    `## [project-profile-entry] (id:${entry.id})`,
    `updated_at: ${normalizeInline(entry.updatedAt)}`,
    `source_input_id: ${normalizeInline(entry.sourceInputId)}`,
    ...(entry.sourceQuote
      ? [`source_quote: ${normalizeInline(entry.sourceQuote)}`]
      : []),
    '',
    normalizeText(entry.content),
  ].join('\n')

export const parseProjectProfileEntries = (
  markdown: string,
): ProjectProfileEntry[] => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const entries: ProjectProfileEntry[] = []
  let currentHeading: string | undefined
  let buffer: string[] = []

  const flush = () => {
    if (!currentHeading) return
    const heading = currentHeading.match(HEADING_RE)
    if (!heading?.[1]) {
      currentHeading = undefined
      buffer = []
      return
    }
    const parsed = parseMetaAndContent(buffer.join('\n'))
    const content = normalizeText(parsed.content)
    if (!content) {
      currentHeading = undefined
      buffer = []
      return
    }
    entries.push({
      id: heading[1].toLowerCase(),
      content,
      sourceInputId: normalizeInline(parsed.meta.get('source_input_id') ?? ''),
      sourceQuote: normalizeInline(parsed.meta.get('source_quote') ?? ''),
      updatedAt:
        normalizeInline(parsed.meta.get('updated_at') ?? '') ||
        PROJECT_PROFILE_FALLBACK_UPDATED_AT,
    })
    currentHeading = undefined
    buffer = []
  }

  for (const line of lines) {
    if (HEADING_RE.test(line)) {
      flush()
      currentHeading = line
      continue
    }
    if (!currentHeading && !line.trim()) continue
    buffer.push(line)
  }
  flush()
  return entries
}

export const formatProjectProfileEntriesMarkdown = (
  entries: ProjectProfileEntry[],
): string =>
  entries.length > 0 ? `${entries.map(formatEntry).join('\n\n')}\n` : ''

export const readProjectProfileEntries = async (
  profilePath: string,
): Promise<ProjectProfileEntry[]> =>
  parseProjectProfileEntries(await readTextFileIfExists(profilePath))

export const writeProjectProfileEntries = async (
  profilePath: string,
  entries: ProjectProfileEntry[],
): Promise<void> => {
  await ensureDir(dirname(profilePath))
  await writeFile(
    profilePath,
    formatProjectProfileEntriesMarkdown(entries),
    'utf8',
  )
}
