const DEFAULT_LOCALE = 'en-US'
const DAY_MS = 24 * 60 * 60 * 1000

const resolvedLocale = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
})()

const resolvedTimeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()

type ZonedDateParts = {
  year: number
  month: number
  day: number
}

const getFormatterKey = (locale: string, timeZone: string): string =>
  `${locale}::${timeZone}`
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>()
const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>()
const datePartsFormatterCache = new Map<string, Intl.DateTimeFormat>()
const fullDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()

const getTimeFormatter = (
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat => {
  const key = getFormatterKey(locale, timeZone)
  const cached = timeFormatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
  timeFormatterCache.set(key, formatter)
  return formatter
}

const getWeekdayFormatter = (
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat => {
  const key = getFormatterKey(locale, timeZone)
  const cached = weekdayFormatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone,
  })
  weekdayFormatterCache.set(key, formatter)
  return formatter
}

const getDatePartsFormatter = (
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat => {
  const key = getFormatterKey(locale, timeZone)
  const cached = datePartsFormatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  })
  datePartsFormatterCache.set(key, formatter)
  return formatter
}

export const getFullDateTimeFormatter = (
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat => {
  const key = getFormatterKey(locale, timeZone)
  const cached = fullDateTimeFormatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
    timeZoneName: 'short',
  })
  fullDateTimeFormatterCache.set(key, formatter)
  return formatter
}

export const resolveLocale = (locale: string | undefined): string =>
  typeof locale === 'string' && locale.trim() ? locale.trim() : resolvedLocale

export const resolveTimeZone = (timeZone: string | undefined): string =>
  typeof timeZone === 'string' && timeZone.trim()
    ? timeZone.trim()
    : resolvedTimeZone

export const getZonedDateParts = (
  date: Date,
  locale: string,
  timeZone: string,
): ZonedDateParts => {
  const formatter = getDatePartsFormatter(locale, timeZone)
  const parts = formatter.formatToParts(date)
  const result: ZonedDateParts = { year: 0, month: 0, day: 0 }
  for (const part of parts) {
    if (part.type === 'year') result.year = Number(part.value)
    else if (part.type === 'month') result.month = Number(part.value)
    else if (part.type === 'day') result.day = Number(part.value)
  }
  return result
}

export const getZonedDayIndex = (
  date: Date,
  locale: string,
  timeZone: string,
): number => {
  const parts = getZonedDateParts(date, locale, timeZone)
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
}

export const formatWeekday = (
  date: Date,
  locale: string,
  timeZone: string,
): string => getWeekdayFormatter(locale, timeZone).format(date)

export const formatTimeOfDay = (
  date: Date,
  locale: string,
  timeZone: string,
): string => getTimeFormatter(locale, timeZone).format(date)
