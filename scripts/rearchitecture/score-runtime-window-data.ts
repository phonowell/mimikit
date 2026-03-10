import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { readJsonl } from '../../src/storage/jsonl.js'

import {
  isInRange,
  normalizeText,
  ratio,
  type GoldenCase,
  type InputPacket,
  type LogRow,
  type ScoreValue,
  type TaskProgressRow,
  type TaskResultPacket,
} from './score-runtime-window-model.js'

export const dedupeTaskResultsByLatest = (
  packets: TaskResultPacket[],
): TaskResultPacket[] => {
  const byTaskId = new Map<string, TaskResultPacket>()
  for (const item of packets) {
    const existing = byTaskId.get(item.taskId)
    if (!existing) {
      byTaskId.set(item.taskId, item)
      continue
    }
    if (item.completedAt >= existing.completedAt) byTaskId.set(item.taskId, item)
  }
  return [...byTaskId.values()]
}

const inputSignature = (input: InputPacket): string =>
  [normalizeText(input.text), input.quote?.trim() ?? '', input.role].join('\n')

export const calcFocusDeterminismRate = (inputs: InputPacket[]): ScoreValue => {
  const bySignature = new Map<string, InputPacket[]>()
  for (const input of inputs) {
    const key = inputSignature(input)
    const bucket = bySignature.get(key)
    if (bucket) bucket.push(input)
    else bySignature.set(key, [input])
  }
  let replayedCases = 0
  let deterministicCases = 0
  for (const bucket of bySignature.values()) {
    if (bucket.length < 2) continue
    replayedCases += bucket.length
    const uniqueFocusIds = new Set(bucket.map((item) => item.focusId.trim()))
    if (uniqueFocusIds.size === 1) deterministicCases += bucket.length
  }
  return ratio(deterministicCases, replayedCases)
}

export const calcRouteCorrectByQuoteRate = (params: {
  inputs: InputPacket[]
  historyFocusById: Map<string, string>
}): ScoreValue => {
  let total = 0
  let correct = 0
  for (const input of params.inputs) {
    const quoteId = input.quote?.trim()
    if (!quoteId) continue
    const quotedFocus = params.historyFocusById.get(quoteId)
    if (!quotedFocus) continue
    total += 1
    if (quotedFocus === input.focusId.trim()) correct += 1
  }
  return ratio(correct, total)
}

export const isEvidenceValid = (result: TaskResultPacket): boolean => {
  const evidence = result.evidence
  if (!evidence) return false
  const goal = evidence.contractGoal?.trim()
  if (!goal) return false
  const acceptance = evidence.acceptanceChecks ?? []
  if (acceptance.length === 0) return false
  const toStatus = evidence.stateDelta?.taskStatusTo
  if (toStatus !== result.status) return false
  if (result.status === 'succeeded') {
    const allMet = acceptance.every((item) => item.met === true)
    if (!allMet) return false
  }
  return true
}

export const listTaskProgressFilesInRange = async (params: {
  workDir: string
  fromDay: string
  toDay: string
}): Promise<string[]> => {
  const root = join(params.workDir, 'task-progress')
  const dirents = await readdir(root, { withFileTypes: true }).catch(() => [])
  const dayDirs = dirents
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => name >= params.fromDay && name <= params.toDay)
  const files: string[] = []
  for (const day of dayDirs) {
    const child = await readdir(join(root, day), { withFileTypes: true }).catch(
      () => [],
    )
    for (const item of child) {
      if (!item.isFile() || !item.name.endsWith('.jsonl')) continue
      files.push(join(root, day, item.name))
    }
  }
  return files
}

export const collectTaskProgressIntegrity = async (params: {
  workDir: string
  fromDay: string
  toDay: string
}): Promise<{ total: number; ok: number }> => {
  const files = await listTaskProgressFilesInRange(params)
  let ok = 0
  for (const file of files) {
    const rows = await readJsonl<TaskProgressRow>(file)
    const hasStart = rows.some((row) => row.type === 'worker_start')
    const hasEnd = rows.some(
      (row) => row.type === 'worker_end' || row.type === 'task_canceled',
    )
    if (hasStart && hasEnd) ok += 1
  }
  return { total: files.length, ok }
}

export const loadGoldenCases = async (
  path: string,
): Promise<GoldenCase[] | undefined> => {
  try {
    await access(path)
  } catch {
    return undefined
  }
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('golden set must be an array')
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('invalid golden case')
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id) throw new Error('golden case id is required')
    const optional = row.optional === true
    const expectedRaw =
      row.expected && typeof row.expected === 'object'
        ? (row.expected as Record<string, unknown>)
        : {}
    const status =
      expectedRaw.status === 'succeeded' ||
      expectedRaw.status === 'failed' ||
      expectedRaw.status === 'canceled'
        ? expectedRaw.status
        : undefined
    const requireEvidence =
      typeof expectedRaw.requireEvidence === 'boolean'
        ? expectedRaw.requireEvidence
        : undefined
    return {
      id,
      ...(optional ? { optional } : {}),
      expected: {
        ...(status ? { status } : {}),
        ...(requireEvidence !== undefined ? { requireEvidence } : {}),
      },
    }
  })
}

export const filterLogsByWindow = (
  logs: LogRow[],
  from: string,
  to: string,
): LogRow[] =>
  logs.filter((row) => {
    const time = row.time
    if (!time) return false
    return isInRange(time, from, to)
  })
