export const parseIsoMs = (value: string): number | undefined => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export const parseIsoToMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

type ScheduleNowSource = {
  clientNowIso?: string
  clientOffsetMinutes?: number
}

const padTimePart = (value: number, width = 2): string =>
  String(value).padStart(width, '0')

export const toUtcOffsetText = (clientOffsetMinutes: number): string => {
  const offsetMinutes = -Math.trunc(clientOffsetMinutes)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  return `${sign}${padTimePart(hours)}:${padTimePart(minutes)}`
}

export const toClientNowLocalIso = (
  clientNowIso: string,
  clientOffsetMinutes: number,
): string | undefined => {
  if (!Number.isFinite(clientOffsetMinutes)) return undefined
  const utcMs = Date.parse(clientNowIso)
  if (!Number.isFinite(utcMs)) return undefined
  const localMs = utcMs - Math.trunc(clientOffsetMinutes) * 60_000
  const localDate = new Date(localMs)
  const utcOffset = toUtcOffsetText(clientOffsetMinutes)
  return `${localDate.getUTCFullYear()}-${padTimePart(
    localDate.getUTCMonth() + 1,
  )}-${padTimePart(localDate.getUTCDate())}T${padTimePart(
    localDate.getUTCHours(),
  )}:${padTimePart(localDate.getUTCMinutes())}:${padTimePart(
    localDate.getUTCSeconds(),
  )}.${padTimePart(localDate.getUTCMilliseconds(), 3)}${utcOffset}`
}

export const resolveScheduleNowIso = (
  source?: ScheduleNowSource,
  serverNowIso = new Date().toISOString(),
): string => {
  if (source?.clientNowIso && source.clientOffsetMinutes !== undefined) {
    const clientNowLocalIso = toClientNowLocalIso(
      source.clientNowIso,
      source.clientOffsetMinutes,
    )
    if (clientNowLocalIso) return clientNowLocalIso
  }
  return source?.clientNowIso ?? serverNowIso
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
