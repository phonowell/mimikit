import { dirname } from 'node:path'

import write from 'fire-keeper/write'

import { ensureDir } from '../fs/paths.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { runSerialized } from '../storage/serialized-lock.js'

export type WriteMemoryInput = {
  content: string
  entryTitle?: string
}

const MAX_ENTRY_CHARS = 4_000

const normalizeContent = (value: string): string =>
  value.replace(/\r\n/g, '\n').trim().slice(0, MAX_ENTRY_CHARS)

const normalizeEntryTitle = (value: string | undefined): string => {
  const trimmed = (value ?? '').replace(/\r\n/g, '\n').trim()
  if (!trimmed) return 'Memory'
  return trimmed.slice(0, 120)
}

const nowIso = (): string => new Date().toISOString()

const renderEntry = (input: WriteMemoryInput): string => {
  const content = normalizeContent(input.content)
  if (!content) throw new Error('append_memory_empty_content')
  const title = normalizeEntryTitle(input.entryTitle)
  const stamp = nowIso()
  return `## ${title} (${stamp})\n\n${content}`
}

export const readMemoryMarkdown = async (memoryPath: string): Promise<string> =>
  readTextFileIfExists(memoryPath)

export const appendMemoryMarkdown = async (
  memoryPath: string,
  input: WriteMemoryInput,
): Promise<void> =>
  runSerialized(memoryPath, async () => {
    const current = await readMemoryMarkdown(memoryPath)
    const entry = renderEntry(input)
    const next = current.trim()
      ? `${current.trimEnd()}\n\n${entry}\n`
      : `${entry}\n`
    await ensureDir(dirname(memoryPath))
    await write(memoryPath, next, { encoding: 'utf8' }, { echo: false })
  })
