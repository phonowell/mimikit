export const nowIso = (): string => new Date().toISOString()

export const addSeconds = (iso: string, seconds: number): string => {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return nowIso()
  return new Date(ts + seconds * 1000).toISOString()
}

export const isExpired = (iso: string, now = new Date()): boolean => {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return true
  return ts <= now.getTime()
}
