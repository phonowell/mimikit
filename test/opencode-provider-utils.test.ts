import { afterEach, expect, test } from 'vitest'

import {
  extractOpencodeOutput,
  mapOpencodeUsage,
  mapOpencodeUsageFromEvent,
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

test('mapOpencodeUsageFromEvent maps assistant message.updated usage', () => {
  const usage = mapOpencodeUsageFromEvent({
    type: 'message.updated',
    properties: {
      info: {
        role: 'assistant',
        sessionID: 's1',
        time: { created: 100 },
        tokens: { input: 3, output: 4, reasoning: 2 },
      },
    },
  } as never)

  expect(usage).toEqual({
    input: 3,
    output: 4,
    total: 9,
  })
})

test('mapOpencodeUsageFromEvent ignores non-target session and older messages', () => {
  const wrongSession = mapOpencodeUsageFromEvent(
    {
      type: 'message.updated',
      properties: {
        info: {
          role: 'assistant',
          sessionID: 's2',
          time: { created: 200 },
          tokens: { input: 1, output: 2, reasoning: 0 },
        },
      },
    } as never,
    's1',
  )
  const tooOld = mapOpencodeUsageFromEvent(
    {
      type: 'message.updated',
      properties: {
        info: {
          role: 'assistant',
          sessionID: 's1',
          time: { created: 150 },
          tokens: { input: 1, output: 2, reasoning: 0 },
        },
      },
    } as never,
    's1',
    200,
  )

  expect(wrongSession).toBeUndefined()
  expect(tooOld).toBeUndefined()
})
