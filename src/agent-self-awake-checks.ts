import {
  type DelegationSpec,
  normalizeDelegationPrompt,
} from './agent-delegation.js'

import type { PendingTask } from './protocol.js'

export const SELF_AWAKE_CHECK_IDS = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
] as const

const SELF_AWAKE_CHECK_SET = new Set<string>(SELF_AWAKE_CHECK_IDS)

export type SelfAwakeCheckId = (typeof SELF_AWAKE_CHECK_IDS)[number]

const extractSelfAwakeCheckId = (prompt: string): SelfAwakeCheckId | null => {
  const match = prompt.match(/^\s*\[?(P\d+)\]?(?::|\s|-)/i)
  if (!match) return null
  const candidate = match[1]?.toUpperCase()
  if (!candidate) return null
  if (!SELF_AWAKE_CHECK_SET.has(candidate)) return null
  return candidate as SelfAwakeCheckId
}

export const collectSelfAwakeCheckIds = (
  tasks: PendingTask[],
): SelfAwakeCheckId[] => {
  const ids = new Set<SelfAwakeCheckId>()
  for (const task of tasks) {
    const id = extractSelfAwakeCheckId(task.prompt)
    if (id) ids.add(id)
  }
  return [...ids]
}

export const collectSelfAwakeCheckIdsFromDelegations = (
  delegations: DelegationSpec[],
): SelfAwakeCheckId[] => {
  const ids = new Set<SelfAwakeCheckId>()
  for (const item of delegations) {
    const prompt = normalizeDelegationPrompt(item.prompt)
    if (!prompt) continue
    const id = extractSelfAwakeCheckId(prompt)
    if (id) ids.add(id)
  }
  return [...ids]
}

export const updateCheckHistory = (
  history: Record<string, string> | undefined,
  checkIds: SelfAwakeCheckId[],
  timestamp: string,
): Record<string, string> | undefined => {
  if (checkIds.length === 0) return history
  const next = { ...(history ?? {}) }
  for (const id of checkIds) next[id] = timestamp
  return next
}

export const formatCheckHistory = (
  history: Record<string, string> | undefined,
): string => {
  if (!history || Object.keys(history).length === 0) return 'None recorded.'
  const lines: string[] = []
  for (const id of SELF_AWAKE_CHECK_IDS) {
    const ts = history[id]
    if (ts) lines.push(`${id}: ${ts}`)
  }
  const extra = Object.keys(history).filter(
    (id) => !SELF_AWAKE_CHECK_SET.has(id),
  )
  extra.sort()
  for (const id of extra) lines.push(`${id}: ${history[id]}`)
  return lines.length > 0 ? lines.join('\n') : 'None recorded.'
}
