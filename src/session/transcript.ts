import fs from 'node:fs/promises'

import { isErrnoException } from '../utils/error.js'
import { appendFile } from '../utils/fs.js'

export type TranscriptRole = 'user' | 'assistant'

export type TranscriptEntry = {
  type: 'message'
  role: TranscriptRole
  text: string
  ts: string
  sessionKey: string
  runId: string
  error?: string
}

export const appendTranscript = async (
  transcriptPath: string,
  entries: TranscriptEntry[],
): Promise<void> => {
  if (entries.length === 0) return
  const payload = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`
  await appendFile(transcriptPath, payload)
}

export const readTranscript = async (
  transcriptPath: string,
  options?: { limit?: number },
): Promise<TranscriptEntry[]> => {
  try {
    const raw = await fs.readFile(transcriptPath, 'utf8')
    if (!raw.trim()) return []
    const entries: TranscriptEntry[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as Partial<TranscriptEntry> | null
        if (!parsed || typeof parsed !== 'object') continue
        if (
          parsed.type === 'message' &&
          (parsed.role === 'user' || parsed.role === 'assistant') &&
          typeof parsed.text === 'string' &&
          typeof parsed.ts === 'string' &&
          typeof parsed.sessionKey === 'string' &&
          typeof parsed.runId === 'string'
        )
          entries.push(parsed as TranscriptEntry)
      } catch {
        continue
      }
    }
    const limit = options?.limit
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0)
      return entries.length > limit ? entries.slice(-limit) : entries

    return entries
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return []
    throw error
  }
}
