import { afterEach, expect, test } from 'vitest'

import {
  extractOpencodeOutput,
  mapOpencodeUsage,
  resolveOpencodeModelRef,
} from '../src/providers/opencode-provider-utils.js'

const restoreEnv = { ...process.env }

afterEach(() => {
  process.env = { ...restoreEnv }
})

test('resolveOpencodeModelRef prefers explicit request over env value', () => {
  process.env.MIMIKIT_OPENCODE_MODEL = 'opencode/from-env'
  expect(resolveOpencodeModelRef('opencode/from-request')).toEqual(
    expect.objectContaining({
      providerID: 'opencode',
      modelID: 'from-request',
    }),
  )
})

test('resolveOpencodeModelRef parses provider and model ids', () => {
  expect(resolveOpencodeModelRef('openrouter/deepseek/r1')).toEqual({
    providerID: 'openrouter',
    modelID: 'deepseek/r1',
  })
})

test('extractOpencodeOutput joins visible text parts only', () => {
  const output = extractOpencodeOutput([
    { type: 'text', text: 'hello' },
    { type: 'text', text: ' world', ignored: true },
    { type: 'text', text: '!' },
    { type: 'tool', state: { status: 'completed' } },
  ] as never)

  expect(output).toBe('hello!')
})

test('mapOpencodeUsage maps token usage and includes reasoning in total', () => {
  const usage = mapOpencodeUsage({
    tokens: {
      input: 10,
      output: 20,
      reasoning: 5,
    },
  } as never)

  expect(usage).toEqual({
    input: 10,
    output: 20,
    total: 35,
  })
})
