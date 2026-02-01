import { existsSync } from 'node:fs'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type InboxItem = { text?: string }
type HistoryItem = { role?: string; text?: string }

const stripBom = (raw: string) => raw.replace(/^\uFEFF/, '')

const readJson = async <T,>(path: string, fallback: T): Promise<T> => {
  try {
    const raw = stripBom(await readFile(path, 'utf8'))
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const loadReplayTexts = async (
  sourceStateDir: string,
  mode: string,
  limit: number,
) => {
  if (mode === 'inbox' || mode === 'auto') {
    const inbox = await readJson<InboxItem[]>(
      join(sourceStateDir, 'inbox.json'),
      [],
    )
    const texts = inbox.map((item) => item.text ?? '').filter(Boolean)
    if (texts.length > 0 || mode === 'inbox')
      return texts.slice(-limit)
  }
  const history = await readJson<HistoryItem[]>(
    join(sourceStateDir, 'history.json'),
    [],
  )
  const users = history
    .filter((item) => item.role === 'user')
    .map((item) => item.text ?? '')
    .filter(Boolean)
  return users.slice(-limit)
}

export const prepareState = async (params: {
  sourceStateDir: string
  stateDir: string
  reset: boolean
}) => {
  if (!params.reset) return
  if (existsSync(params.stateDir))
    await rm(params.stateDir, { recursive: true, force: true })
  await cp(params.sourceStateDir, params.stateDir, {
    recursive: true,
    force: true,
  })
  await writeFile(join(params.stateDir, 'inbox.json'), '[]\n', 'utf8')
  await writeFile(join(params.stateDir, 'log.jsonl'), '', 'utf8')
}
