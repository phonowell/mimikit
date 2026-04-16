export type WindowSelectParams = {
  minCount: number
  maxCount: number
  workingFocusIds?: string[] | undefined
  latestResultTaskId?: string | undefined
}

type NormalizedWindowParams = {
  minCount: number
  maxCount: number
  workingFocusIds: Set<string>
  latestResultTaskId?: string
  hasAnchors: boolean
}

export const normalizeWindowParams = (
  params: WindowSelectParams,
): NormalizedWindowParams => {
  const minCount = Math.max(0, params.minCount)
  const maxCount = Math.max(minCount, params.maxCount)
  const workingFocusIds = new Set(
    (params.workingFocusIds ?? []).map((id) => id.trim()).filter(Boolean),
  )
  const trimmedLatestResultTaskId = params.latestResultTaskId?.trim()
  const latestResultTaskId =
    trimmedLatestResultTaskId && trimmedLatestResultTaskId.length > 0
      ? trimmedLatestResultTaskId
      : undefined
  return {
    minCount,
    maxCount,
    workingFocusIds,
    ...(latestResultTaskId ? { latestResultTaskId } : {}),
    hasAnchors: workingFocusIds.size > 0 || Boolean(latestResultTaskId),
  }
}

export const selectByWindow = <T>(
  items: T[],
  params: WindowSelectParams,
): T[] => {
  const normalized = normalizeWindowParams(params)
  if (items.length === 0 || normalized.maxCount === 0) return []
  return items.slice(0, normalized.maxCount)
}

export const selectByWorklinePriority = <T>(
  items: T[],
  params: WindowSelectParams,
  buckets: {
    isPrimary: (item: T, normalized: NormalizedWindowParams) => boolean
    isAnchor: (item: T, normalized: NormalizedWindowParams) => boolean
    isRelated: (item: T, normalized: NormalizedWindowParams) => boolean
  },
): T[] => {
  const normalized = normalizeWindowParams(params)
  if (items.length === 0 || normalized.maxCount === 0) return []
  if (!normalized.hasAnchors) return items.slice(0, normalized.maxCount)

  const selected: T[] = []
  const seen = new Set<T>()
  const push = (item: T): void => {
    if (selected.length >= normalized.maxCount || seen.has(item)) return
    selected.push(item)
    seen.add(item)
  }
  const pushBucket = (
    predicate: (item: T, normalized: NormalizedWindowParams) => boolean,
  ): void => {
    for (const item of items) if (predicate(item, normalized)) push(item)
  }

  pushBucket(buckets.isPrimary)
  pushBucket(buckets.isAnchor)
  pushBucket(buckets.isRelated)
  for (const item of items) push(item)
  return selected
}
