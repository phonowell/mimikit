import { expect, test } from 'vitest'

import { isNoChoiceReturnChannelSource } from '../src/channels/shared/source.js'

test('isNoChoiceReturnChannelSource handles empty/unknown sources safely', () => {
  expect(isNoChoiceReturnChannelSource(undefined)).toBe(false)
  expect(isNoChoiceReturnChannelSource('')).toBe(false)
  expect(isNoChoiceReturnChannelSource('webui')).toBe(false)
})
