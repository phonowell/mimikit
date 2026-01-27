import fs from 'node:fs/promises'
import path from 'node:path'

import { appendFile } from '../../utils/fs.js'

import { formatTaskRecord } from './format.js'
import { type TaskRecord } from './types.js'

const ledgerPath = (stateDir: string): string => path.join(stateDir, 'tasks.md')

export const appendTaskRecord = async (
  stateDir: string,
  record: TaskRecord,
): Promise<void> => {
  await appendFile(ledgerPath(stateDir), formatTaskRecord(record))
}

const parseTaskSection = (section: string): TaskRecord | null => {
  const lines = section.split('\n')
  const header = lines[0]?.trim()
  if (!header?.startsWith('## Task ')) return null
  const id = header.slice('## Task '.length).trim()
  if (!id) return null

  const record: TaskRecord = {
    id,
    status: 'queued',
    sessionKey: '',
    runId: '',
    retries: 0,
    attempt: 0,
    createdAt: '',
    updatedAt: '',
    resume: 'auto',
  }

  let i = 1
  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.startsWith('- prompt: |')) {
      i += 1
      const buffer: string[] = []
      while (i < lines.length) {
        const raw = lines[i] ?? ''
        if (raw.startsWith('- ')) break
        buffer.push(raw.startsWith('  ') ? raw.slice(2) : raw)
        i += 1
      }
      record.prompt = buffer.join('\n')
      continue
    }

    if (line.startsWith('- result: |')) {
      i += 1
      const buffer: string[] = []
      while (i < lines.length) {
        const raw = lines[i] ?? ''
        if (raw.startsWith('- ')) break
        buffer.push(raw.startsWith('  ') ? raw.slice(2) : raw)
        i += 1
      }
      record.result = buffer.join('\n')
      continue
    }

    const match = line.match(/^- ([^:]+):\s*(.*)$/)
    if (match) {
      const key = match[1]
      if (!key) {
        i += 1
        continue
      }
      const value = match[2] ?? ''
      switch (key) {
        case 'status':
          if (
            value === 'queued' ||
            value === 'running' ||
            value === 'done' ||
            value === 'failed'
          )
            record.status = value

          break
        case 'sessionKey':
          record.sessionKey = value
          break
        case 'runId':
          record.runId = value
          break
        case 'retries':
          record.retries = Number.parseInt(value, 10) || 0
          break
        case 'attempt':
          record.attempt = Number.parseInt(value, 10) || 0
          break
        case 'createdAt':
          record.createdAt = value
          break
        case 'updatedAt':
          record.updatedAt = value
          break
        case 'resume':
          if (value === 'auto' || value === 'always' || value === 'never')
            record.resume = value

          break
        case 'maxIterations': {
          const parsed = Number.parseInt(value, 10)
          if (Number.isFinite(parsed) && parsed > 0)
            record.maxIterations = parsed

          break
        }
        case 'verifyCommand':
          if (value) record.verifyCommand = value

          break
        case 'triggeredByTaskId':
          if (value) record.triggeredByTaskId = value

          break
        case 'codexSessionId':
          if (value) record.codexSessionId = value

          break
        default:
          break
      }
    }

    i += 1
  }

  return record
}

export const loadTaskLedger = async (
  stateDir: string,
): Promise<Map<string, TaskRecord>> => {
  const filePath = ledgerPath(stateDir)
  let content = ''
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') throw error
  }

  const tasks = new Map<string, TaskRecord>()
  if (!content.trim()) return tasks

  const sections = content.split(/\n(?=## Task )/)
  for (const section of sections) {
    const record = parseTaskSection(section)
    if (record) tasks.set(record.id, record)
  }

  return tasks
}
