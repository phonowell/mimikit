import matter from 'gray-matter'

export type ArchiveHeaderLine = readonly [
  label: string,
  value: string | number | undefined,
]

export type ArchiveSection = {
  marker: string
  content: string
}

export const dateStamp = (iso: string): string => iso.slice(0, 10)

export type ParsedArchiveDocument = {
  header: Record<string, string>
  sections: Map<string, string>
}

const normalizeHeaderValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const buildArchiveDocument = (
  headers: ArchiveHeaderLine[],
  sections: ArchiveSection[],
): string => {
  const data: Record<string, string | number> = {}
  for (const [label, value] of headers) {
    if (value === undefined || value === '') continue
    data[label] = value
  }
  const content = sections
    .map((section) => `${section.marker}\n${section.content}`)
    .join('\n\n')
  return `${matter.stringify(content, data).replace(/\s+$/u, '')}\n`
}

const parseSections = (content: string): Map<string, string> => {
  const sections = new Map<string, string>()
  const lines = content.split(/\r?\n/)
  let marker: string | undefined
  let bucket: string[] = []
  const flush = () => {
    if (!marker) return
    sections.set(marker, bucket.join('\n').replace(/\s+$/u, ''))
    bucket = []
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^===\s+.+\s+===$/u.test(trimmed)) {
      flush()
      marker = trimmed
      continue
    }
    bucket.push(line)
  }
  flush()
  return sections
}

export const parseArchiveDocument = (
  content: string,
): ParsedArchiveDocument => {
  const header: Record<string, string> = {}
  const parsed = matter(content)
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!key) continue
    const normalized = normalizeHeaderValue(value)
    if (!normalized) continue
    header[key] = normalized
  }
  return {
    header,
    sections: parseSections(parsed.content),
  }
}

export const extractArchiveSection = (
  doc: ParsedArchiveDocument,
  marker: string,
): string => doc.sections.get(marker) ?? ''
