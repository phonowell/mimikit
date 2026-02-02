import { nowIso } from '../time.js'

import { readJsonl, updateJsonl, writeJsonl } from './jsonl.js'
import { withStoreLock } from './store-lock.js'

import type { UserInput } from '../types/user-input.js'

const MAX_ITEMS = 1000

const capUserInputs = (inputs: UserInput[]): UserInput[] => {
  if (inputs.length <= MAX_ITEMS) return inputs
  const pending = inputs.filter((input) => !input.processedByThinker)
  if (pending.length >= MAX_ITEMS) return pending
  const slots = MAX_ITEMS - pending.length
  const processed = inputs.filter((input) => input.processedByThinker)
  const keepProcessed = processed.slice(Math.max(0, processed.length - slots))
  const keepIds = new Set<string>([
    ...pending.map((input) => input.id),
    ...keepProcessed.map((input) => input.id),
  ])
  return inputs.filter((input) => keepIds.has(input.id))
}

export const appendUserInputs = async (
  path: string,
  inputs: UserInput[],
): Promise<void> => {
  if (inputs.length === 0) return
  await updateJsonl<UserInput>(path, (current) =>
    capUserInputs([...current, ...inputs]),
  )
}

const mergeSourceIds = (
  existing?: string[],
  next?: string[],
): string[] | undefined => {
  const merged = new Set<string>()
  if (existing) for (const id of existing) merged.add(id)
  if (next) for (const id of next) merged.add(id)
  return merged.size > 0 ? [...merged] : undefined
}

export const upsertUserDraft = async (
  path: string,
  draft: {
    id: string
    summary: string
    createdAt: string
    updatedAt?: string
    sourceIds?: string[]
  },
): Promise<void> => {
  if (!draft.summary) return
  await updateJsonl<UserInput>(path, (current) => {
    const pendingIndexes = current.reduce<number[]>((acc, input, index) => {
      if (!input.processedByThinker) acc.push(index)
      return acc
    }, [])
    if (pendingIndexes.length === 0) {
      const entry: UserInput = {
        id: draft.id,
        summary: draft.summary,
        createdAt: draft.createdAt,
        processedByThinker: false,
        ...(draft.updatedAt ? { updatedAt: draft.updatedAt } : {}),
        ...(draft.sourceIds ? { sourceIds: draft.sourceIds } : {}),
      }
      return capUserInputs([...current, entry])
    }
    const index = pendingIndexes[pendingIndexes.length - 1] ?? -1
    const existing = current[index]
    if (!existing) {
      const entry: UserInput = {
        id: draft.id,
        summary: draft.summary,
        createdAt: draft.createdAt,
        processedByThinker: false,
        ...(draft.updatedAt ? { updatedAt: draft.updatedAt } : {}),
        ...(draft.sourceIds ? { sourceIds: draft.sourceIds } : {}),
      }
      return capUserInputs([...current, entry])
    }
    let mergedSourceIds = mergeSourceIds(existing.sourceIds, draft.sourceIds)
    for (const pendingIndex of pendingIndexes) {
      if (pendingIndex === index) continue
      mergedSourceIds = mergeSourceIds(
        mergedSourceIds,
        current[pendingIndex]?.sourceIds,
      )
    }
    const updated: UserInput = {
      ...existing,
      id: existing.id,
      createdAt: existing.createdAt,
      summary: draft.summary,
      processedByThinker: false,
      updatedAt: draft.updatedAt ?? nowIso(),
      ...(mergedSourceIds ? { sourceIds: mergedSourceIds } : {}),
    }
    return capUserInputs(
      current.map((input, idx) => {
        if (idx === index) return updated
        if (pendingIndexes.includes(idx))
          return { ...input, processedByThinker: true }
        return input
      }),
    )
  })
}

export const readUserInputs = (path: string): Promise<UserInput[]> =>
  readJsonl<UserInput>(path)

export const hasUnprocessedUserInputs = async (
  path: string,
): Promise<boolean> => {
  const inputs = await readJsonl<UserInput>(path)
  return inputs.some((input) => !input.processedByThinker)
}

export const takeUnprocessedUserInputs = (path: string): Promise<UserInput[]> =>
  withStoreLock(path, async () => {
    const inputs = await readJsonl<UserInput>(path)
    const pending = inputs.filter((input) => !input.processedByThinker)
    if (pending.length === 0) return []
    const pendingIds = new Set(pending.map((input) => input.id))
    const next = inputs.map((input) =>
      pendingIds.has(input.id) ? { ...input, processedByThinker: true } : input,
    )
    await writeJsonl(path, capUserInputs(next))
    return pending
  })
