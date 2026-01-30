import { MAX_DELEGATIONS } from './agent-constants.js'
import { shortId } from './id.js'

import type { PendingTask, Protocol } from './protocol.js'

export type DelegationSpec = {
  prompt?: unknown
}

const DELEGATION_BLOCK_PATTERN = /```delegations\s*([\s\S]*?)```/i

export const extractDelegations = (
  output: string,
): {
  cleanedOutput: string
  delegations: DelegationSpec[]
} => {
  const match = output.match(DELEGATION_BLOCK_PATTERN)
  if (match?.index === undefined)
    return { cleanedOutput: output, delegations: [] }

  const jsonText = match[1]?.trim() ?? ''
  if (!jsonText) return { cleanedOutput: output, delegations: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { cleanedOutput: output, delegations: [] }
  }

  if (!Array.isArray(parsed)) return { cleanedOutput: output, delegations: [] }

  const before = output.slice(0, match.index)
  const after = output.slice(match.index + match[0].length)
  const cleaned = `${before}\n${after}`.trim()
  return { cleanedOutput: cleaned, delegations: parsed as DelegationSpec[] }
}

export const normalizeDelegationPrompt = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
}

export const enqueueDelegations = async (
  protocol: Protocol,
  delegations: DelegationSpec[],
  options?: {
    maxDelegations?: number
    origin?: PendingTask['origin']
    selfAwakeRunId?: string
  },
): Promise<PendingTask[]> => {
  if (delegations.length === 0) return []
  const prompts: string[] = []
  const seen = new Set<string>()
  const maxDelegations = options?.maxDelegations ?? MAX_DELEGATIONS

  for (const item of delegations) {
    const prompt = normalizeDelegationPrompt(item.prompt)
    if (!prompt || seen.has(prompt)) continue
    seen.add(prompt)
    prompts.push(prompt)
    if (prompts.length >= maxDelegations) break
  }

  if (prompts.length === 0) return []

  const now = new Date().toISOString()
  const tasks: PendingTask[] = prompts.map((prompt) => ({
    id: shortId(),
    prompt,
    createdAt: now,
    ...(options?.origin === undefined ? {} : { origin: options.origin }),
    ...(options?.selfAwakeRunId === undefined
      ? {}
      : { selfAwakeRunId: options.selfAwakeRunId }),
  }))

  for (const task of tasks) await protocol.addPendingTask(task)
  return tasks
}
