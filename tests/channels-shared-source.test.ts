import { expect, test } from 'vitest'

import {
  NO_CHOICE_RETURN_SOURCES,
  isNoChoiceReturnChannelSource,
  normalizeSource,
} from '../src/channels/shared/source.js'

test('normalizeSource trims and lowercases source', () => {
  expect(normalizeSource('  TeLeGrAm  ')).toBe('telegram')
  expect(normalizeSource(undefined)).toBe('')
})

test('isNoChoiceReturnChannelSource supports configured channel sources only', () => {
  expect(NO_CHOICE_RETURN_SOURCES).toEqual(['telegram', 'feishu'])
  expect(isNoChoiceReturnChannelSource('telegram')).toBe(true)
  expect(isNoChoiceReturnChannelSource('feishu')).toBe(true)
  expect(isNoChoiceReturnChannelSource('webui')).toBe(false)
  expect(isNoChoiceReturnChannelSource('')).toBe(false)
  expect(isNoChoiceReturnChannelSource(undefined)).toBe(false)
})
