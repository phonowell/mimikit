import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { appendDailyMemory, formatTimestamp } from './write.js'

import type { ChatMessage, UserInput } from '../protocol.js'

export type MemoryFlushState = {
  lastFlushAt?: string | undefined
  lastChatSize?: number | undefined
  lastHandoffAt?: string | undefined
  lastHandoffChatCount?: number | undefined
}

export type MemoryFlushResult = {
  didFlush: boolean
  path?: string | undefined
}

const FLUSH_TRIGGER_MESSAGES = 800
const FLUSH_MIN_INTERVAL_MS = 60 * 60 * 1000

const flushStatePath = (stateDir: string): string =>
  join(stateDir, 'memory_flush.json')

export const readMemoryFlushState = async (
  stateDir: string,
): Promise<MemoryFlushState> => {
  try {
    const data = await readFile(flushStatePath(stateDir), 'utf-8')
    return JSON.parse(data) as MemoryFlushState
  } catch {
    return {}
  }
}

export const writeMemoryFlushState = async (
  stateDir: string,
  state: MemoryFlushState,
): Promise<void> => {
  await writeFile(flushStatePath(stateDir), JSON.stringify(state, null, 2))
}

export const updateMemoryFlushState = async (
  stateDir: string,
  next: Partial<MemoryFlushState>,
): Promise<MemoryFlushState> => {
  const current = await readMemoryFlushState(stateDir)
  const merged: MemoryFlushState = { ...current, ...next }
  await writeMemoryFlushState(stateDir, merged)
  return merged
}

const formatTranscript = (messages: ChatMessage[]): string[] =>
  messages.map((msg) => {
    const role = msg.role === 'user' ? 'User' : 'Agent'
    return `[${role}] ${msg.text}`
  })

export const maybeMemoryFlush = async (params: {
  stateDir: string
  workDir: string
  chatHistory: ChatMessage[]
  userInputs: UserInput[]
  now?: Date | undefined
}): Promise<MemoryFlushResult> => {
  const now = params.now ?? new Date()
  const total = params.chatHistory.length
  if (total < FLUSH_TRIGGER_MESSAGES) return { didFlush: false }

  const state = await readMemoryFlushState(params.stateDir)
  const lastFlushAt = state.lastFlushAt ? Date.parse(state.lastFlushAt) : 0
  if (lastFlushAt && now.getTime() - lastFlushAt < FLUSH_MIN_INTERVAL_MS)
    return { didFlush: false }

  const inputIds = new Set(params.userInputs.map((input) => input.id))
  const eligible = params.chatHistory.filter((msg) => !inputIds.has(msg.id))
  if (eligible.length === 0) return { didFlush: false }

  const recent = eligible.filter((msg) => {
    if (!lastFlushAt) return true
    const ts = Date.parse(msg.createdAt)
    return Number.isFinite(ts) && ts > lastFlushAt
  })

  if (recent.length === 0) return { didFlush: false }

  const entry = {
    title: 'auto-flush',
    timestamp: formatTimestamp(now),
    source: 'auto-flush',
    lines: formatTranscript(recent),
  }

  const result = await appendDailyMemory({
    workDir: params.workDir,
    date: now,
    entry,
  })

  await updateMemoryFlushState(params.stateDir, {
    lastFlushAt: formatTimestamp(now),
    lastChatSize: total,
  })

  return { didFlush: true, path: result.path }
}
