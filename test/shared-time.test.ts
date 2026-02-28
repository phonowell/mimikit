import { expect, test } from 'vitest'

import {
  resolveScheduleNowIso,
  toClientNowLocalIso,
  toUtcOffsetText,
} from '../src/shared/time.js'

test('toUtcOffsetText renders offset from client offset minutes', () => {
  expect(toUtcOffsetText(-480)).toBe('+08:00')
  expect(toUtcOffsetText(330)).toBe('-05:30')
})

test('toClientNowLocalIso converts utc instant to local instant text', () => {
  const localIso = toClientNowLocalIso('2026-02-09T03:20:00.000Z', -480)
  expect(localIso).toBe('2026-02-09T11:20:00.000+08:00')
})

test('resolveScheduleNowIso prefers client local iso when metadata is complete', () => {
  const scheduleNowIso = resolveScheduleNowIso(
    {
      clientNowIso: '2026-02-09T03:20:00.000Z',
      clientOffsetMinutes: -480,
    },
    '2026-02-09T00:00:00.000Z',
  )
  expect(scheduleNowIso).toBe('2026-02-09T11:20:00.000+08:00')
})

test('resolveScheduleNowIso falls back from client now to server now', () => {
  const fromClient = resolveScheduleNowIso(
    {
      clientNowIso: '2026-02-09T03:20:00.000Z',
    },
    '2026-02-09T00:00:00.000Z',
  )
  expect(fromClient).toBe('2026-02-09T03:20:00.000Z')

  const fromServer = resolveScheduleNowIso(
    {
      clientOffsetMinutes: -480,
    },
    '2026-02-09T00:00:00.000Z',
  )
  expect(fromServer).toBe('2026-02-09T00:00:00.000Z')
})
