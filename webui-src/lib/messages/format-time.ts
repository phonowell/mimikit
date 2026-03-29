import {
  formatTimeOfDay,
  formatWeekday,
  getFullDateTimeFormatter,
  getZonedDateParts,
  getZonedDayIndex,
  resolveLocale,
  resolveTimeZone,
} from './format-time-formatters.js'

const numericPattern = /^-?\d+(?:\.\d+)?$/u
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/u
const trailingTimeZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/iu
const RELATIVE_MINUTE_THRESHOLD_MS = 5 * 60 * 1000

type TimeInput = string | number | Date | null | undefined

type FormatTimeOptions = {
  now?: TimeInput
  locale?: string
  timeZone?: string
  relative?: boolean
  calendarWords?: boolean
}

type FormatContext = {
  date: Date
  locale: string
  timeZone: string
}

const resolveNowDate = (now: TimeInput): Date =>
  parseTimeInput(now) || new Date()

const resolveFormatContext = (
  input: TimeInput,
  options: FormatTimeOptions = {},
): FormatContext | null => {
  const date = parseTimeInput(input)
  if (!date) return null
  return {
    date,
    locale: resolveLocale(options.locale),
    timeZone: resolveTimeZone(options.timeZone),
  }
}

const resolveLocalDateTime = (text: string): Date | null => {
  const match = localDateTimePattern.exec(text)
  if (!match || trailingTimeZonePattern.test(text)) return null
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

export const parseTimeInput = (input: TimeInput): Date | null => {
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

const formatMonthDay = (
  date: Date,
  locale: string,
  timeZone: string,
): string => {
  const parts = getZonedDateParts(date, locale, timeZone)
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

const formatYearMonthDay = (
  date: Date,
  locale: string,
  timeZone: string,
): string => {
  const parts = getZonedDateParts(date, locale, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export const formatDateTimeFull = (
  input: TimeInput,
  options: FormatTimeOptions = {},
): string => {
  const context = resolveFormatContext(input, options)
  if (!context) return ''
  const { date, locale, timeZone } = context
  return getFullDateTimeFormatter(locale, timeZone).format(date)
}

export const formatDisplayTime = (
  input: TimeInput,
  options: FormatTimeOptions = {},
): string => {
  const target = parseTimeInput(input)
  if (!target) return ''
  const now = resolveNowDate(options.now)
  const locale = resolveLocale(options.locale)
  const timeZone = resolveTimeZone(options.timeZone)
  const relative = options.relative !== false
  const calendarWords = options.calendarWords === true

  const diffMs = now.getTime() - target.getTime()
  if (relative && diffMs >= 0) {
    if (diffMs < 60 * 1000) return ''
    if (diffMs > RELATIVE_MINUTE_THRESHOLD_MS && diffMs < 60 * 60 * 1000) {
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
  if (withinWeek)
    return `${formatWeekday(target, locale, timeZone)} ${timeText}`

  const nowYear = getZonedDateParts(now, locale, timeZone).year
  const targetYear = getZonedDateParts(target, locale, timeZone).year
  if (nowYear === targetYear)
    return `${formatMonthDay(target, locale, timeZone)} ${timeText}`
  return `${formatYearMonthDay(target, locale, timeZone)} ${timeText}`
}

export const formatDisplayTimeWithFull = (
  input: TimeInput,
  options: FormatTimeOptions = {},
): { displayText: string; fullText: string } => {
  const target = parseTimeInput(input)
  if (!target) return { displayText: '', fullText: '' }
  const now = resolveNowDate(options.now)
  const locale = resolveLocale(options.locale)
  const timeZone = resolveTimeZone(options.timeZone)
  return {
    displayText: formatDisplayTime(target, {
      ...options,
      now,
      locale,
      timeZone,
    }),
    fullText: formatDateTimeFull(target, { locale, timeZone }),
  }
}
