import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ensureDir } from '../../persistence/fs/paths.js'
import { readTextFileIfExists } from '../../persistence/fs/read-text.js'

import {
  PROJECT_PROFILE_FALLBACK_UPDATED_AT,
  type ProjectProfileEntry,
} from './entry-types.js'

const HEADING_RE =
  /^##\s+\[project-profile-entry\]\s+\(id:(project-profile-[a-z0-9._-]+)\)$/i
const META_LINE_RE = /^([a-z_]+):\s*(.*)$/i

const normalizeInline = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const normalizeText = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const parseMetaAndContent = (
  body: string,
): {
  meta: Map<string, string>
  content: string
} => {
  const trimmed = normalizeText(body)
  if (!trimmed) return { meta: new Map(), content: '' }
  const sections = trimmed.split(/\n{2,}/)
  const first = sections[0]
  if (!first) return { meta: new Map(), content: trimmed }
  const lines = first.split('\n').map((line) => line.trim())
  if (lines.length === 0 || lines.some((line) => !META_LINE_RE.test(line)))
    return { meta: new Map(), content: trimmed }
  const meta = new Map<string, string>()
  for (const line of lines) {
    const matched = line.match(META_LINE_RE)
    const key = matched?.[1]?.toLowerCase()
    if (!key) continue
    meta.set(key, matched?.[2]?.trim() ?? '')
  }
  return {
    meta,
    content: normalizeText(sections.slice(1).join('\n\n')),
  }
}

const formatEntry = (entry: ProjectProfileEntry): string =>
  [
    `## [project-profile-entry] (id:${entry.id})`,
    `updated_at: ${normalizeInline(entry.updatedAt)}`,
    `source_input_id: ${normalizeInline(entry.sourceInputId)}`,
    `source_quote: ${normalizeInline(entry.sourceQuote)}`,
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
