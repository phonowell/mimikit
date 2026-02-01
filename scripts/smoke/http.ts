import type { HistoryMessage } from './types.js'
import { sleep } from './utils.js'

type TaskList = {
  tasks: Array<{
    id: string
    status: string
    createdAt?: string
    completedAt?: string
  }>
}

export const fetchJson = async <T>(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export const waitForStatus = async (params: {
  baseUrl: string
  token: string
  timeoutMs: number
}) => {
  const start = Date.now()
  while (Date.now() - start < params.timeoutMs) {
    try {
      const status = await fetchJson<{ ok: boolean }>(
        `${params.baseUrl}/api/status`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${params.token}` },
        },
        5000,
      )
      if (status.ok) return
    } catch {
      // ignore and retry
    }
    await sleep(500)
  }
  throw new Error('status check timeout')
}

export const postInput = async (params: {
  baseUrl: string
  token: string
  text: string
}): Promise<string> => {
  const res = await fetchJson<{ id: string }>(
    `${params.baseUrl}/api/input`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: params.text }),
    },
    10000,
  )
  return res.id
}

export const fetchMessages = async (params: {
  baseUrl: string
  token: string
  limit: number
}): Promise<HistoryMessage[]> => {
  const res = await fetchJson<{ messages: HistoryMessage[] }>(
    `${params.baseUrl}/api/messages?limit=${params.limit}`,
    { method: 'GET', headers: { Authorization: `Bearer ${params.token}` } },
    10000,
  )
  return res.messages ?? []
}

export const fetchTasks = async (params: {
  baseUrl: string
  token: string
  limit: number
}): Promise<TaskList> => {
  const res = await fetchJson<TaskList>(
    `${params.baseUrl}/api/tasks?limit=${params.limit}`,
    { method: 'GET', headers: { Authorization: `Bearer ${params.token}` } },
    10000,
  )
  return res
}

export const waitForAgentMatch = async (params: {
  baseUrl: string
  token: string
  userId: string
  timeoutMs: number
  predicate?: (msg: HistoryMessage) => boolean
}) => {
  const start = Date.now()
  while (Date.now() - start < params.timeoutMs) {
    const messages = await fetchMessages({
      baseUrl: params.baseUrl,
      token: params.token,
      limit: 200,
    })
    const idx = messages.findIndex((m) => m.id === params.userId)
    if (idx >= 0) {
      const after = messages.slice(idx + 1)
      for (const msg of after) {
        if (msg.role !== 'agent') continue
        if (!params.predicate || params.predicate(msg)) return msg
      }
    }
    await sleep(500)
  }
  throw new Error('agent reply timeout')
}

export const resolveUserCreatedAt = async (params: {
  baseUrl: string
  token: string
  userId: string
}): Promise<string> => {
  const messages = await fetchMessages({
    baseUrl: params.baseUrl,
    token: params.token,
    limit: 200,
  })
  const user = messages.find((msg) => msg.id === params.userId)
  if (!user) throw new Error('user message not found')
  return user.createdAt
}
