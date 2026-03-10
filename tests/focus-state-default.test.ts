import { expect, test } from 'vitest'

import { INBOX_FOCUS_ID } from '../src/focus/constants.js'
import { ensureFocus, resolveDefaultFocusId, setFocusStatus } from '../src/focus/state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createRuntime = (
  focuses: RuntimeState['focuses'],
): RuntimeState =>
  ({
    focuses,
  }) as unknown as RuntimeState

test('resolveDefaultFocusId prefers active non-global focus', () => {
  const runtime = createRuntime([
    {
      id: 'focus-global',
      title: 'Global',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'focus-a',
      title: 'A',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
    },
    {
      id: 'focus-b',
      title: 'B',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
  ])
  expect(resolveDefaultFocusId(runtime)).toBe('focus-b')
})

test('resolveDefaultFocusId reuses idle non-global focus when no active non-global exists', () => {
  const runtime = createRuntime([
    {
      id: 'focus-global',
      title: 'Global',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
    {
      id: 'focus-idle',
      title: 'Idle',
      status: 'idle',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
    },
  ])
  expect(resolveDefaultFocusId(runtime)).toBe('focus-idle')
})

test('resolveDefaultFocusId does not reuse inbox when other idle focus exists', () => {
  const runtime = createRuntime([
    {
      id: 'focus-global',
      title: 'Global',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
    {
      id: INBOX_FOCUS_ID,
      title: 'Inbox',
      status: 'idle',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
    {
      id: 'focus-idle',
      title: 'Idle',
      status: 'idle',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
    },
  ])
  expect(resolveDefaultFocusId(runtime)).toBe('focus-idle')
})

test('resolveDefaultFocusId falls back to inbox when only global exists', () => {
  const runtime = createRuntime([
    {
      id: 'focus-global',
      title: 'Global',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
  ])
  expect(resolveDefaultFocusId(runtime)).toBe(INBOX_FOCUS_ID)
})

test('setFocusStatus keeps inbox focus reusable when archived is requested', () => {
  const runtime = ({
    focuses: [
      {
        id: INBOX_FOCUS_ID,
        title: 'Inbox',
        status: 'idle',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
        lastActivityAt: '2026-03-01T00:00:00.000Z',
      },
    ],
  }) as unknown as RuntimeState

  setFocusStatus(runtime, INBOX_FOCUS_ID, 'archived')

  expect(runtime.focuses[0]?.status).toBe('idle')
})

test('ensureFocus revives legacy archived inbox to idle', () => {
  const runtime = ({
    focuses: [
      {
        id: INBOX_FOCUS_ID,
        title: 'Inbox',
        status: 'archived',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
        lastActivityAt: '2026-03-01T00:00:00.000Z',
      },
    ],
  }) as unknown as RuntimeState

  const focus = ensureFocus(runtime, INBOX_FOCUS_ID)

  expect(focus.status).toBe('idle')
})
