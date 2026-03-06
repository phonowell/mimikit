import { readTextFileIfExists } from '../fs/read-text.js'

export type MemorySection = {
  id: string
  title: string
  body: string
}

const slugify = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'section'
}

const normalizeTitle = (value: string, index: number): string => {
  const trimmed = value.trim()
  if (!trimmed) return `Section ${index + 1}`
  return trimmed
}

export const parseMemorySections = (source: string): MemorySection[] => {
  const lines = source.split(/\r?\n/)
  const sections: MemorySection[] = []
  let currentTitle = ''
  let currentBody: string[] = []

  const flush = () => {
    const body = currentBody.join('\n').trim()
    if (!currentTitle && !body) return
    const index = sections.length
    const title = normalizeTitle(currentTitle || 'General', index)
    const id = `memory:section:${slugify(title)}-${index + 1}`
    sections.push({ id, title, body })
    currentBody = []
  }

  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (!heading) {
      currentBody.push(line)
      continue
    }
    flush()
    currentTitle = heading[1] ?? ''
  }
  flush()
  return sections
}

export const readMemorySections = async (
  memoryFilePath: string,
): Promise<MemorySection[]> => {
  const markdown = (await readTextFileIfExists(memoryFilePath)).trim()
  if (!markdown) return []
  return parseMemorySections(markdown)
}
