import { acquireLock } from '../../session/lock.js'
import { type SessionRecord } from '../../session/store.js'
import {
  appendTranscript,
  type TranscriptEntry,
} from '../../session/transcript.js'
import { appendTaskRecord, type TaskRecord } from '../ledger.js'

import type { Config } from '../../config.js'

export const failTask = async (
  config: Config,
  tasks: Map<string, TaskRecord>,
  task: TaskRecord,
  session: SessionRecord,
  message: string,
  lockHeld: boolean,
  options?: { skipTranscript?: boolean },
): Promise<void> => {
  const failed: TaskRecord = {
    ...task,
    status: 'failed',
    updatedAt: new Date().toISOString(),
    result: message,
  }

  await appendTaskRecord(config.stateDir, failed)
  tasks.set(task.id, failed)

  if (!options?.skipTranscript) {
    const lockTimeoutMs = config.timeoutMs + 30_000
    let release: (() => Promise<void>) | undefined
    let canWrite = lockHeld
    if (!lockHeld) {
      try {
        release = await acquireLock(session.transcriptPath, lockTimeoutMs)
        canWrite = true
      } catch {
        canWrite = false
      }
    }

    if (canWrite) {
      const prompt = task.prompt ?? ''
      const entries: TranscriptEntry[] = [
        {
          type: 'message',
          role: 'user',
          text: prompt,
          ts: new Date().toISOString(),
          sessionKey: task.sessionKey,
          runId: task.runId,
        },
        {
          type: 'message',
          role: 'assistant',
          text: message,
          ts: new Date().toISOString(),
          sessionKey: task.sessionKey,
          runId: task.runId,
          error: message,
        },
      ]
      await appendTranscript(session.transcriptPath, entries)
    }

    if (release) await release()
  }
}
