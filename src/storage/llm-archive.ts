import { appendFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ensureDir } from '../fs/ensure.js'
import { nowIso } from '../time.js'

import type { TokenUsage } from '../types/common.js'

export type LlmArchiveEntry = {
  role: 'manager' | 'worker'
  prompt: string
  output?: string
  ok: boolean
  elapsedMs?: number
  usage?: TokenUsage
  model?: string
  attempt?: 'primary' | 'fallback'
  error?: string
  errorName?: string
  taskId?: string
  threadId?: string | null
}

const dateStamp = (iso: string): string => iso.slice(0, 10)

const buildArchivePath = (stateDir: string, iso: string): string =>
  join(stateDir, 'llm', `${dateStamp(iso)}.jsonl`)

export const appendLlmArchive = async (
  stateDir: string,
  entry: LlmArchiveEntry,
): Promise<void> => {
  const timestamp = nowIso()
  const path = buildArchivePath(stateDir, timestamp)
  await ensureDir(dirname(path))
  const line = `${JSON.stringify({ timestamp, ...entry })}\n`
  await appendFile(path, line, 'utf8')
}
