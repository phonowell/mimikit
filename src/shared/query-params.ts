export const parseOptionalNumber = (
  raw: string | undefined,
  fallback: number,
): number => (raw === undefined ? fallback : Number(raw))

export const normalizeMsRange = (
  fromMs?: number,
  toMs?: number,
): { fromMs?: number; toMs?: number } => {
  if (fromMs !== undefined && toMs !== undefined) {
    return {
      fromMs: Math.min(fromMs, toMs),
      toMs: Math.max(fromMs, toMs),
    }
  }
  return {
    ...(fromMs !== undefined ? { fromMs } : {}),
    ...(toMs !== undefined ? { toMs } : {}),
  }
}
