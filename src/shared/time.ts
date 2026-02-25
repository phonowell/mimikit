export const parseIsoMs = (value: string): number | undefined => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export const parseIsoToMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

export const computeRecencyWeight = (
  timestampMs: number,
  oldestMs: number,
  newestMs: number,
): number => {
  if (newestMs <= oldestMs) return 1
  const normalized = (timestampMs - oldestMs) / (newestMs - oldestMs)
  return Math.min(1, Math.max(0, normalized))
}
