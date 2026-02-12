import { expect, test } from 'vitest'

import {
  mergeTokenUsage,
  readEventUsage,
} from '../src/providers/opencode-provider-utils.js'

test('readEventUsage parses step_finish token usage', () => {
  const usage = readEventUsage({
    type: 'step_finish',
    part: {
      tokens: {
        input: 123,
        output: 45,
        total: 200,
      },
    },
  })

  expect(usage).toEqual({ input: 123, output: 45, total: 200 })
})

test('readEventUsage supports token aliases and total-only payload', () => {
  const aliasUsage = readEventUsage({
    type: 'step_finish',
    part: {
      tokens: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 20,
      },
    },
  })
  const totalOnlyUsage = readEventUsage({
    type: 'step_finish',
    part: {
      tokens: {
        total_tokens: 99,
      },
    },
  })

  expect(aliasUsage).toEqual({ input: 10, output: 5, total: 20 })
  expect(totalOnlyUsage).toEqual({ total: 99 })
})

test('mergeTokenUsage accumulates usage across multiple steps', () => {
  const step1 = { input: 6_702, output: 35, total: 15_937 }
  const step2 = { input: 106, output: 6, total: 16_048 }

  const aggregated = mergeTokenUsage(mergeTokenUsage(undefined, step1), step2)

  expect(aggregated).toEqual({ input: 6_808, output: 41, total: 31_985 })
})
