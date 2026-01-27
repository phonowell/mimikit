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
