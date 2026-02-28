const DEFAULT_LOCALE = 'en-US'
const DAY_MS = 24 * 60 * 60 * 1000
const numericPattern = /^-?\d+(?:\.\d+)?$/u
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/u
const trailingTimeZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/iu

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

const resolveLocale = (locale) =>
  typeof locale === 'string' && locale.trim() ? locale.trim() : DEFAULT_LOCALE

const resolveTimeZone = (timeZone) =>
  typeof timeZone === 'string' && timeZone.trim()
    ? timeZone.trim()
    : resolvedTimeZone

const resolveNowDate = (now) => {
  const parsed = parseTimeInput(now)
  return parsed || new Date()
}

const resolveLocalDateTime = (text) => {
  const match = localDateTimePattern.exec(text)
  if (!match) return null
  if (trailingTimeZonePattern.test(text)) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] ?? 0)
  const minute = Number(match[5] ?? 0)
  const second = Number(match[6] ?? 0)
  const candidate = new Date(year, month - 1, day, hour, minute, second, 0)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute ||
    candidate.getSeconds() !== second
  )
    return null
  return candidate
}

export const parseTimeInput = (input) => {
  if (input instanceof Date) {
    const time = input.getTime()
    return Number.isFinite(time) ? new Date(time) : null
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const candidate = new Date(input)
    return Number.isFinite(candidate.getTime()) ? candidate : null
  }
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (!text) return null
  if (numericPattern.test(text)) {
    const asNumber = Number(text)
    if (!Number.isFinite(asNumber)) return null
    const candidate = new Date(asNumber)
    return Number.isFinite(candidate.getTime()) ? candidate : null
  }
  const localDateTime = resolveLocalDateTime(text)
  if (localDateTime) return localDateTime
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed)
}

const getZonedDateParts = (date, locale, timeZone) => {
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

const getZonedDayIndex = (date, locale, timeZone) => {
  const parts = getZonedDateParts(date, locale, timeZone)
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS)
}

const formatWeekday = (date, locale, timeZone) => {
  const weekday = getWeekdayFormatter(locale, timeZone).format(date)
  return weekday
}

const formatTimeOfDay = (date, locale, timeZone) =>
  getTimeFormatter(locale, timeZone).format(date)

const formatMonthDay = (date, locale, timeZone) => {
  const parts = getZonedDateParts(date, locale, timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${month}-${day}`
}

const formatYearMonthDay = (date, locale, timeZone) => {
  const parts = getZonedDateParts(date, locale, timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

export const formatAbsoluteDateTime = (input, options = {}) => {
  const date = parseTimeInput(input)
  if (!date) return ''
  const locale = resolveLocale(options.locale)
  const timeZone = resolveTimeZone(options.timeZone)
  const dateText = formatYearMonthDay(date, locale, timeZone)
  const timeText = formatTimeOfDay(date, locale, timeZone)
  return `${dateText} ${timeText}`
}

export const formatDisplayTime = (input, options = {}) => {
  const target = parseTimeInput(input)
  if (!target) return ''
  const now = resolveNowDate(options.now)
  const locale = resolveLocale(options.locale)
  const timeZone = resolveTimeZone(options.timeZone)
  const relative = options.relative !== false
  const calendarWords = options.calendarWords === true

  const diffMs = now.getTime() - target.getTime()
  if (relative && diffMs >= 0) {
    if (diffMs < 60 * 1000) return 'just now'
    if (diffMs < 60 * 60 * 1000) {
      const minutes = Math.floor(diffMs / (60 * 1000))
      return `${minutes} min ago`
    }
  }

  const dayDelta =
    getZonedDayIndex(now, locale, timeZone) -
    getZonedDayIndex(target, locale, timeZone)
  const timeText = formatTimeOfDay(target, locale, timeZone)

  if (dayDelta === 0) return calendarWords ? `today ${timeText}` : timeText
  if (dayDelta === 1) return `yesterday ${timeText}`
  if (dayDelta === -1 && calendarWords) return `tomorrow ${timeText}`

  const withinWeek =
    (dayDelta > 1 && dayDelta < 7) || (dayDelta < -1 && dayDelta > -7)
  if (withinWeek) return `${formatWeekday(target, locale, timeZone)} ${timeText}`

  const nowYear = getZonedDateParts(now, locale, timeZone).year
  const targetYear = getZonedDateParts(target, locale, timeZone).year
  if (nowYear === targetYear)
    return `${formatMonthDay(target, locale, timeZone)} ${timeText}`
  return `${formatYearMonthDay(target, locale, timeZone)} ${timeText}`
}

export const formatTime = (input, options = {}) => formatDisplayTime(input, options)

export const formatDateTime = (input, options = {}) =>
  formatAbsoluteDateTime(input, options)

const asNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const integerFormatter = new Intl.NumberFormat('en-US')
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

const formatIntegerCount = (value) => {
  if (value === null) return ''
  return integerFormatter.format(Math.round(value))
}

const formatCompactCount = (value) => {
  if (value === null) return ''
  return compactFormatter.format(Math.round(value)).replace(/K$/u, 'k')
}

export const formatUsage = (usage) => {
  if (!usage) return null
  const input = asNumber(usage.input)
  const output = asNumber(usage.output)
  const inputCacheRead = asNumber(usage.inputCacheRead)
  const inputCacheWrite = asNumber(usage.inputCacheWrite)
  const outputCache = asNumber(usage.outputCache)
  const total = asNumber(usage.total)
  const sessionTotal = asNumber(usage.sessionTotal)
  const hasInputSide =
    input !== null || inputCacheRead !== null || inputCacheWrite !== null
  const hasOutputSide = output !== null || outputCache !== null

  if (!hasInputSide && !hasOutputSide && total === null && sessionTotal === null)
    return null

  const inputTotal = hasInputSide
    ? Math.round(input ?? 0) +
      Math.round(inputCacheRead ?? 0) +
      Math.round(inputCacheWrite ?? 0)
    : null
  const outputTotal = hasOutputSide
    ? Math.round(output ?? 0) + Math.round(outputCache ?? 0)
    : null

  const textParts = []
  if (inputTotal !== null) textParts.push(`\u2191 ${formatCompactCount(inputTotal)}`)
  if (outputTotal !== null) textParts.push(`\u2193 ${formatCompactCount(outputTotal)}`)
  if (inputTotal === null && outputTotal === null && total !== null)
    textParts.push(`\u03a3 ${formatCompactCount(total)}`)
  if (sessionTotal !== null) textParts.push(`S ${formatCompactCount(sessionTotal)}`)
  const text = textParts.join(' \u00b7 ')
  const title = [
    ...(inputTotal !== null
      ? [
          `Input total tokens: ${formatCompactCount(inputTotal)}`,
          `Input tokens: ${formatCompactCount(input ?? 0)}`,
          `Input cache read tokens: ${formatCompactCount(inputCacheRead ?? 0)}`,
          `Input cache write tokens: ${formatCompactCount(inputCacheWrite ?? 0)}`,
        ]
      : []),
    ...(outputTotal !== null
      ? [
          `Output total tokens: ${formatCompactCount(outputTotal)}`,
          `Output tokens: ${formatCompactCount(output ?? 0)}`,
          `Output cache tokens: ${formatCompactCount(outputCache ?? 0)}`,
        ]
      : []),
    ...(total !== null ? [`Total tokens: ${formatIntegerCount(total)}`] : []),
    ...(sessionTotal !== null
      ? [`Session total tokens: ${formatIntegerCount(sessionTotal)}`]
      : []),
  ].join('\n')
  return { text, title }
}

export const formatElapsedLabel = (elapsedMs) => {
  const ms = asNumber(elapsedMs)
  if (ms === null) return ''
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const seconds = totalSeconds % 60
  const parts = []
  if (totalHours > 0) {
    parts.push(`${totalHours}h`)
    parts.push(`${minutes}m`)
  } else 
    parts.push(`${totalMinutes}m`)
  
  parts.push(`${seconds}s`)
  return parts.join(' ')
}
