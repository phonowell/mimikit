import fs from 'node:fs/promises'
import path from 'node:path'

import { readJsonFile, writeJsonFile } from '../utils/fs.js'

export type SessionRecord = {
  sessionKey: string
  createdAt: string
  updatedAt: string
  transcriptPath: string
  codexSessionId?: string
}

type SessionStoreData = {
  sessions: Record<string, SessionRecord>
}

const sanitizeKey = (sessionKey: string): string =>
  sessionKey.replace(/[^a-zA-Z0-9._-]/g, '_')

export class SessionStore {
  private filePath: string
  private sessions: Record<string, SessionRecord>

  private constructor(
    filePath: string,
    sessions: Record<string, SessionRecord>,
  ) {
    this.filePath = filePath
    this.sessions = sessions
  }

  static async load(stateDir: string): Promise<SessionStore> {
    const filePath = path.join(stateDir, 'sessions.json')
    const data = await readJsonFile<Partial<SessionStoreData>>(filePath, {})
    const sessions = data.sessions ?? {}
    return new SessionStore(filePath, sessions)
  }

  get(sessionKey: string): SessionRecord | undefined {
    return this.sessions[sessionKey]
  }

  ensure(sessionKey: string): SessionRecord {
    const existing = this.sessions[sessionKey]
    if (existing) return existing

    const now = new Date().toISOString()
    const transcriptPath = path.join(
      path.dirname(this.filePath),
      'sessions',
      `${sanitizeKey(sessionKey)}.jsonl`,
    )

    const record: SessionRecord = {
      sessionKey,
      createdAt: now,
      updatedAt: now,
      transcriptPath,
    }

    this.sessions[sessionKey] = record
    return record
  }

  update(sessionKey: string, updates: Partial<SessionRecord>): SessionRecord {
    const record = this.ensure(sessionKey)
    const updated: SessionRecord = {
      ...record,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    this.sessions[sessionKey] = updated
    return updated
  }

  async remove(sessionKey: string): Promise<boolean> {
    const record = this.sessions[sessionKey]
    if (!record) return false
    const lockPath = `${record.transcriptPath}.lock`
    const removeFile = async (filePath: string): Promise<void> => {
      try {
        await fs.unlink(filePath)
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code !== 'ENOENT') throw error
      }
    }
    await removeFile(lockPath)
    await removeFile(record.transcriptPath)
    delete this.sessions[sessionKey]
    await this.flush()
    return true
  }

  all(): Record<string, SessionRecord> {
    return { ...this.sessions }
  }

  async flush(): Promise<void> {
    await writeJsonFile(this.filePath, { sessions: this.sessions })
  }
}
