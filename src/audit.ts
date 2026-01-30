import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { getDiffStatSummary, isGitRepo } from './git.js'

export type AuditEntry = {
  ts: string
  action: string
  taskId?: string
  trigger?: 'self-awake' | 'event' | 'task'
  runId?: string
  detail?: string
  diff?: string
}

const AUDIT_FILE = 'audit.jsonl'

export const getGitDiffSummary = async (workDir: string): Promise<string> => {
  if (!(await isGitRepo(workDir))) return ''
  return getDiffStatSummary(workDir)
}

export const appendAudit = async (
  stateDir: string,
  entry: AuditEntry,
): Promise<void> => {
  const path = join(stateDir, AUDIT_FILE)
  const line = `${JSON.stringify(entry)}\n`
  try {
    await appendFile(path, line)
  } catch {
    try {
      await mkdir(stateDir, { recursive: true })
      await appendFile(path, line)
    } catch {
      // ignore audit failures
    }
  }
}
