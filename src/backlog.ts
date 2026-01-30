import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type BacklogItem = {
  text: string
  done: boolean
}

const BACKLOG_FILE = 'backlog.md'
const CHECKBOX_LINE = /^(\s*[-*]\s+)\[( |x|X)\](\s+)(.*)$/

const parseBacklogLine = (line: string): BacklogItem | null => {
  const match = line.match(CHECKBOX_LINE)
  if (!match) return null
  const text = match[4]?.trim()
  if (!text) return null
  return {
    text,
    done: match[2]?.toLowerCase() === 'x',
  }
}

export const readBacklog = async (stateDir: string): Promise<BacklogItem[]> => {
  try {
    const data = await readFile(join(stateDir, BACKLOG_FILE), 'utf-8')
    const lines = data.split(/\r?\n/)
    const items: BacklogItem[] = []
    for (const line of lines) {
      const item = parseBacklogLine(line)
      if (item) items.push(item)
    }
    return items
  } catch {
    return []
  }
}

export const markBacklogDone = async (
  stateDir: string,
  taskText: string,
): Promise<boolean> => {
  const target = taskText.trim()
  if (!target) return false

  let data = ''
  try {
    data = await readFile(join(stateDir, BACKLOG_FILE), 'utf-8')
  } catch {
    return false
  }

  const lines = data.split(/\r?\n/)
  let updated = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === undefined) continue
    const match = line.match(CHECKBOX_LINE)
    if (!match) continue
    const text = match[4]?.trim()
    if (text !== target) continue
    if (match[2]?.toLowerCase() === 'x') continue
    lines[i] = `${match[1]}[x]${match[3]}${match[4]}`
    updated = true
    break
  }

  if (!updated) return false

  await writeFile(join(stateDir, BACKLOG_FILE), lines.join('\n'))
  return true
}
