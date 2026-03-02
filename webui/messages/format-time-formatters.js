const DEFAULT_LOCALE = 'en-US'
const DAY_MS = 24 * 60 * 60 * 1000

const resolvedTimeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()

const getFormatterKey = (locale, timeZone) => `${locale}::${timeZone}`
const timeFormatterCache = new Map()
const weekdayFormatterCache = new Map()
const datePartsFormatterCache = new Map()
const fullDateTimeFormatterCache = new Map()

const getTimeFormatter = (locale, timeZone) => {
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

const getWeekdayFormatter = (locale, timeZone) => {
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

const getDatePartsFormatter = (locale, timeZone) => {
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

export const getFullDateTimeFormatter = (locale, timeZone) => {
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

export const resolveLocale = (locale) =>
  typeof locale === 'string' && locale.trim() ? locale.trim() : DEFAULT_LOCALE

export const resolveTimeZone = (timeZone) =>
  typeof timeZone === 'string' && timeZone.trim()
    ? timeZone.trim()
    : resolvedTimeZone

export const getZonedDateParts = (date, locale, timeZone) => {
  const formatter = getDatePartsFormatter(locale, timeZone)
  const parts = formatter.formatToParts(date)
  const result = { year: 0, month: 0, day: 0 }
  for (const part of parts) {
    if (part.type === 'year') result.year = Number(part.value)
    else if (part.type === 'month') result.month = Number(part.value)
    else if (part.type === 'day') result.day = Number(part.value)
  }
  return result
}

export const getZonedDayIndex = (date, locale, timeZone) => {
  const parts = getZonedDateParts(date, locale, timeZone)
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
}

export const formatWeekday = (date, locale, timeZone) =>
  getWeekdayFormatter(locale, timeZone).format(date)

export const formatTimeOfDay = (date, locale, timeZone) =>
  getTimeFormatter(locale, timeZone).format(date)
