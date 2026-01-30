import { LATIN_STOPWORDS } from '../stopwords.js'

import { readMemoryFlushState, updateMemoryFlushState } from './flush.js'
import { formatTimestamp, writeSessionMemoryFile } from './write.js'

import type { ChatMessage, UserInput } from '../protocol.js'

export type AutoHandoffResult = {
  didHandoff: boolean
  resetSession: boolean
  reason?: 'idle' | 'count' | undefined
  path?: string | undefined
}

const IDLE_THRESHOLD_MS = 6 * 60 * 60 * 1000
const COUNT_THRESHOLD = 100
const MAX_SLUG_TOKENS = 3
const MAX_SLUG_CHARS = 48

const tokenizeLatin = (text: string): string[] => {
  const matches = text.match(/[a-z0-9]{2,}/gi)
  if (!matches) return []
  return matches
    .map((token) => token.toLowerCase())
    .filter((token) => !LATIN_STOPWORDS.has(token))
}

const buildSlug = (messages: ChatMessage[], fallback: string): string => {
  const counts = new Map<string, number>()
  for (const msg of messages) {
    for (const token of tokenizeLatin(msg.text))
      counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    if (b[0].length !== a[0].length) return b[0].length - a[0].length
    return a[0].localeCompare(b[0])
  })
  const tokens = ranked.slice(0, MAX_SLUG_TOKENS).map(([token]) => token)
  const slug = tokens.join('-')
  if (!slug) return fallback
  if (slug.length <= MAX_SLUG_CHARS) return slug
  return slug.slice(0, MAX_SLUG_CHARS)
}

const formatTranscript = (messages: ChatMessage[]): string[] =>
  messages.map((msg) => {
    const role = msg.role === 'user' ? 'User' : 'Agent'
    return `[${role}] ${msg.text}`
  })

export const maybeAutoHandoff = async (params: {
  stateDir: string
  workDir: string
  userInputs: UserInput[]
  chatHistory: ChatMessage[]
  sessionId?: string | undefined
  now?: Date | undefined
}): Promise<AutoHandoffResult> => {
  const now = params.now ?? new Date()
  if (params.chatHistory.length === 0)
    return { didHandoff: false, resetSession: false }

  const state = await readMemoryFlushState(params.stateDir)
  const lastHandoffAt = state.lastHandoffAt
    ? Date.parse(state.lastHandoffAt)
    : 0
  const inputIds = new Set(params.userInputs.map((input) => input.id))
  const eligible = params.chatHistory.filter((msg) => !inputIds.has(msg.id))
  if (eligible.length === 0) return { didHandoff: false, resetSession: false }

  const recent = eligible.filter((msg) => {
    if (!lastHandoffAt) return true
    const ts = Date.parse(msg.createdAt)
    return Number.isFinite(ts) && ts > lastHandoffAt
  })

  if (recent.length === 0) return { didHandoff: false, resetSession: false }

  const lastMessage = recent[recent.length - 1]
  const lastMessageAt = lastMessage ? Date.parse(lastMessage.createdAt) : 0
  const idleTrigger =
    Number.isFinite(lastMessageAt) &&
    now.getTime() - lastMessageAt >= IDLE_THRESHOLD_MS
  const countTrigger = recent.length >= COUNT_THRESHOLD

  if (!idleTrigger && !countTrigger)
    return { didHandoff: false, resetSession: false }

  const fallback = formatTimestamp(now).slice(11, 16).replace(':', '')
  const slug = buildSlug(recent, fallback)
  const transcript = formatTranscript(recent)
  const writeResult = await writeSessionMemoryFile({
    workDir: params.workDir,
    date: now,
    slug,
    source: idleTrigger ? 'auto-handoff:idle' : 'auto-handoff:count',
    sessionId: params.sessionId,
    messages: transcript,
  })

  await updateMemoryFlushState(params.stateDir, {
    lastHandoffAt: lastMessage?.createdAt ?? now.toISOString(),
    lastHandoffChatCount: params.chatHistory.length,
  })

  return {
    didHandoff: true,
    resetSession: true,
    reason: idleTrigger ? 'idle' : 'count',
    path: writeResult.path,
  }
}
