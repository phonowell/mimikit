export type ArchiveHeaderLine = readonly [
  label: string,
  value: string | number | undefined,
]

export type ArchiveSection = {
  marker: string
  content: string
}

export const dateStamp = (iso: string): string => iso.slice(0, 10)

export const formatSection = (marker: string, content: string): string =>
  `${marker}\n${content}`

export const buildArchiveDocument = (
  headers: ArchiveHeaderLine[],
  sections: ArchiveSection[],
): string => {
  const lines: string[] = []
  for (const [label, value] of headers) {
    if (value === undefined || value === '') continue
    lines.push(`${label}: ${value}`)
  }
  const serializedSections = sections
    .map((section) => formatSection(section.marker, section.content))
    .join('\n\n')
  return `${lines.join('\n')}\n\n${serializedSections}\n`
}

export const parseArchiveHeader = (lines: string[]): Record<string, string> => {
  const header: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) break
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    if (!key) continue
    header[key] = line.slice(colon + 1).trim()
  }
  return header
}

export const extractArchiveSection = (
  lines: string[],
  marker: string,
): string => {
  const index = lines.findIndex((line) => line.trim() === marker)
  if (index < 0) return ''
  return lines
    .slice(index + 1)
    .join('\n')
    .replace(/\s+$/u, '')
}
