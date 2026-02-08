export type WindowSelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

export const normalizeWindowParams = (
  params: WindowSelectParams,
): WindowSelectParams => {
  const minCount = Math.max(0, params.minCount)
  const maxCount = Math.max(minCount, params.maxCount)
  const maxBytes = Math.max(0, params.maxBytes)
  return { minCount, maxCount, maxBytes }
}

export const selectByWindow = <T>(
  items: T[],
  params: WindowSelectParams,
  estimateBytes: (item: T) => number,
): T[] => {
  const normalized = normalizeWindowParams(params)
  if (items.length === 0 || normalized.maxCount === 0) return []
  const selected: T[] = []
  let totalBytes = 0
  for (const item of items) {
    const rawBytes = estimateBytes(item)
    const itemBytes = Number.isFinite(rawBytes) && rawBytes > 0 ? rawBytes : 0
    totalBytes += itemBytes
    selected.push(item)
    if (selected.length >= normalized.maxCount) break
    if (normalized.maxBytes > 0 && totalBytes > normalized.maxBytes)
      if (selected.length >= normalized.minCount) break
  }
  return selected
}
