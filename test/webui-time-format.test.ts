import { describe, expect, test } from 'vitest'

import {
  formatAbsoluteDateTime,
  formatDateTimeFull,
  formatDisplayTime,
  formatDisplayTimeWithFull,
  parseTimeInput,
} from '../webui/messages/format.js'

const BASE_OPTIONS = {
  locale: 'en-US',
  timeZone: 'UTC',
  now: '2026-02-28T12:00:00.000Z',
}

describe('parseTimeInput', () => {
  test('parses iso and epoch values', () => {
    expect(parseTimeInput('2026-02-28T12:34:56.000Z')?.toISOString()).toBe(
      '2026-02-28T12:34:56.000Z',
    )
    expect(parseTimeInput(1761940800000)?.toISOString()).toBe(
      '2025-10-31T20:00:00.000Z',
    )
    expect(parseTimeInput('1761940800000')?.toISOString()).toBe(
      '2025-10-31T20:00:00.000Z',
    )
  })

  test('parses local datetime string without timezone', () => {
    const parsed = parseTimeInput('2026-02-28 12:34:56')
    expect(parsed).toBeTruthy()
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(1)
    expect(parsed?.getDate()).toBe(28)
    expect(parsed?.getHours()).toBe(12)
    expect(parsed?.getMinutes()).toBe(34)
    expect(parsed?.getSeconds()).toBe(56)
  })

  test('returns null for invalid values', () => {
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('invalid')).toBeNull()
    expect(parseTimeInput(Number.NaN)).toBeNull()
  })
})

describe('formatDisplayTime', () => {
  test('formats relative text', () => {
    expect(
      formatDisplayTime('2026-02-28T11:59:30.000Z', {
        ...BASE_OPTIONS,
      }),
    ).toBe('just now')
    expect(
      formatDisplayTime('2026-02-28T11:15:00.000Z', {
        ...BASE_OPTIONS,
      }),
    ).toBe('45 min ago')
  })

  test('formats same day and yesterday', () => {
    expect(
      formatDisplayTime('2026-02-28T09:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
      }),
    ).toBe('09:10')
    expect(
      formatDisplayTime('2026-02-27T23:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
      }),
    ).toBe('yesterday 23:10')
  })

  test('formats within week, same year and cross year', () => {
    expect(
      formatDisplayTime('2026-02-25T09:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
      }),
    ).toBe('Wed 09:10')
    expect(
      formatDisplayTime('2026-01-15T09:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
      }),
    ).toBe('01-15 09:10')
    expect(
      formatDisplayTime('2025-12-31T23:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
      }),
    ).toBe('2025-12-31 23:10')
  })

  test('formats scheduled future using calendar words', () => {
    expect(
      formatDisplayTime('2026-03-01T09:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
        calendarWords: true,
      }),
    ).toBe('tomorrow 09:10')
    expect(
      formatDisplayTime('2026-02-28T14:10:00.000Z', {
        ...BASE_OPTIONS,
        relative: false,
        calendarWords: true,
      }),
    ).toBe('today 14:10')
  })
})

test('formatAbsoluteDateTime returns normalized datetime', () => {
  expect(
    formatAbsoluteDateTime('2026-02-28T09:10:00.000Z', {
      locale: 'en-US',
      timeZone: 'UTC',
    }),
  ).toBe('2026-02-28 09:10')
})

test('formatDateTimeFull includes seconds and timezone', () => {
  const full = formatDateTimeFull('2026-02-28T09:10:00.000Z', {
    locale: 'en-US',
    timeZone: 'UTC',
  })
  expect(full).toContain('09:10:00')
  expect(full).toContain('UTC')
})

test('formatDisplayTimeWithFull returns display and full text', () => {
  expect(
    formatDisplayTimeWithFull('2026-02-28T09:10:00.000Z', {
      ...BASE_OPTIONS,
      relative: false,
    }),
  ).toMatchObject({
    displayText: '09:10',
  })

  expect(
    formatDisplayTimeWithFull('2026-02-28T09:10:00.000Z', {
      ...BASE_OPTIONS,
      relative: false,
    }).fullText,
  ).toContain('09:10:00')

  expect(formatDisplayTimeWithFull('invalid')).toMatchObject({
    displayText: '',
    fullText: '',
  })
})
