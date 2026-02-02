import { appendFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { writeItem } from '../storage/queue.js'
import { nowIso } from '../time.js'
import { TASK_SCHEMA_VERSION } from '../types/schema.js'

import { addArchiveJob } from './archive-jobs.js'
import { makeSlug } from './slug.js'

import type { HistoryMessage } from '../types/history.js'
import type { Task } from '../types/tasks.js'

const dayFromIso = (iso: string): string => iso.slice(0, 10)
const monthFromIso = (iso: string): string => iso.slice(0, 7)

const previousMonth = (iso: string): string => {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  if (!y || !m) return iso.slice(0, 7)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}

export const shouldArchive = (
  history: HistoryMessage[],
  now: Date,
): boolean => {
  const unarchived = history.filter((m) => m.archived !== true)
  if (unarchived.length > 100) return true
  const lastArchived = history
    .filter((m) => m.archived === true)
    .map((m) => Date.parse(m.createdAt))
    .sort((a, b) => b - a)[0]
  if (!lastArchived) return false
  return now.getTime() - lastArchived > 6 * 60 * 60 * 1000
}

export const applyHistoryLimits = (
  history: HistoryMessage[],
  softLimit: number,
  hardCount: number,
): HistoryMessage[] => {
  if (history.length <= softLimit) return history
  const archived = history.filter((m) => m.archived === true)
  const unarchived = history.filter((m) => m.archived !== true)
  const trimmedArchived = archived.slice(
    Math.max(0, archived.length - Math.max(0, softLimit - unarchived.length)),
  )
  const merged = [...trimmedArchived, ...unarchived]
  if (merged.length <= hardCount) return merged
  const excess = merged.length - hardCount
  const remainingArchived = trimmedArchived.slice(excess)
  return [...remainingArchived, ...unarchived]
}

const buildSummaryPrompt = (template: string, messages: HistoryMessage[]) => {
  const lines = messages.map((m) => `- [${m.createdAt}] ${m.role}: ${m.text}`)
  return `${template}\n\n## Messages\n${lines.join('\n')}`
}

const resolveMemoryPath = async (params: {
  stateDir: string
  day: string
  slug: string
}): Promise<string> => {
  const base = join(
    params.stateDir,
    'memory',
    `${params.day}-${params.slug}.md`,
  )
  let path = base
  let idx = 1
  for (;;) {
    try {
      await stat(path)
      path = join(
        params.stateDir,
        'memory',
        `${params.day}-${params.slug}-${idx}.md`,
      )
      idx += 1
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (code === 'ENOENT') return path
      throw error
    }
  }
}

const createWorkerTask = async (params: {
  workerQueue: string
  prompt: string
  id: string
}): Promise<Task> => {
  const task: Task = {
    schemaVersion: TASK_SCHEMA_VERSION,
    id: params.id,
    type: 'oneshot',
    prompt: params.prompt,
    priority: 5,
    createdAt: nowIso(),
    attempts: 0,
    timeout: null,
  }
  await writeItem(params.workerQueue, task.id, task)
  return task
}

export const archiveHistory = async (params: {
  history: HistoryMessage[]
  stateDir: string
  workerQueue: string
  archiveJobsPath: string
  dailyTemplate: string
  monthlyTemplate: string
}): Promise<HistoryMessage[]> => {
  const now = new Date()
  const nowMonth = monthFromIso(nowIso())
  const prevMonth = previousMonth(nowIso())
  const pending = params.history.filter((m) => {
    if (m.archived === true || m.archived === 'pending') return false
    if (m.archiveNextAt && Date.parse(m.archiveNextAt) > now.getTime())
      return false
    return true
  })
  if (pending.length === 0) return params.history

  const pendingIds = new Set(pending.map((m) => m.id))
  const updated = params.history.map((m) => {
    if (m.archived === true) return m
    if (!pendingIds.has(m.id)) return m
    return { ...m, archived: 'pending' as const }
  })
  const byId = new Map(updated.map((m) => [m.id, m]))

  const byDay = new Map<string, HistoryMessage[]>()
  for (const msg of pending) {
    const day = dayFromIso(msg.createdAt)
    const group = byDay.get(day) ?? []
    group.push(msg)
    byDay.set(day, group)
  }

  for (const [day, messages] of byDay.entries()) {
    const month = day.slice(0, 7)
    const ageDays = Math.floor(
      (now.getTime() - Date.parse(`${day}T00:00:00Z`)) / 86400000,
    )
    if (ageDays <= 5) {
      const slug = makeSlug(messages[0]?.text ?? day)
      const path = await resolveMemoryPath({
        stateDir: params.stateDir,
        day,
        slug,
      })
      const body = messages
        .map((m) => `[${m.createdAt}] ${m.role}: ${m.text}`)
        .join('\n')
      await appendFile(path, `${body}\n`, 'utf8')
      for (const msg of messages) {
        const ref = byId.get(msg.id)
        if (ref) ref.archived = true
      }
      continue
    }

    if (month === nowMonth || month === prevMonth) {
      const prompt = buildSummaryPrompt(params.dailyTemplate, messages)
      const id = crypto.randomUUID().replace(/-/g, '')
      await createWorkerTask({ workerQueue: params.workerQueue, prompt, id })
      await addArchiveJob(params.archiveJobsPath, {
        id,
        messageIds: messages.map((m) => m.id),
        outputPath: join(params.stateDir, 'memory', 'summary', `${day}.md`),
      })
      continue
    }

    const prompt = buildSummaryPrompt(params.monthlyTemplate, messages)
    const id = crypto.randomUUID().replace(/-/g, '')
    await createWorkerTask({ workerQueue: params.workerQueue, prompt, id })
    await addArchiveJob(params.archiveJobsPath, {
      id,
      messageIds: messages.map((m) => m.id),
      outputPath: join(params.stateDir, 'memory', 'summary', `${month}.md`),
    })
  }

  return updated
}
