import { expect, test } from 'vitest'

import {
  hasUserInputFromSource,
  isUserInputFromSource,
  resolveLatestUserInputFromSource,
} from '../src/channels/shared/passive-reply.js'

import type { UserInput } from '../src/types.js'

const inputs: UserInput[] = [
  {
    id: 'input-webui-1',
    role: 'user',
    text: 'webui',
    createdAt: '2026-03-07T00:00:00.000Z',
    focusId: 'focus-global',
    source: 'webui',
  },
  {
    id: 'sys-1',
    role: 'system',
    visibility: 'all',
    text: 'system',
    createdAt: '2026-03-07T00:00:01.000Z',
    focusId: 'focus-global',
  },
  {
    id: 'input-tg-1',
    role: 'user',
    text: 'telegram',
    createdAt: '2026-03-07T00:00:02.000Z',
    focusId: 'focus-global',
    source: 'telegram',
  },
]

test('isUserInputFromSource matches role and source', () => {
  expect(isUserInputFromSource(inputs[0] as UserInput, 'webui')).toBe(true)
  expect(isUserInputFromSource(inputs[1] as UserInput, 'webui')).toBe(false)
})

test('hasUserInputFromSource scans list by source', () => {
  expect(hasUserInputFromSource(inputs, 'telegram')).toBe(true)
  expect(hasUserInputFromSource(inputs, 'feishu')).toBe(false)
})

test('resolveLatestUserInputFromSource returns latest matched user input', () => {
  const latest = resolveLatestUserInputFromSource(inputs, 'telegram')
  expect(latest?.id).toBe('input-tg-1')
})
