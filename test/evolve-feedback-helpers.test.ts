import { expect, test } from 'vitest'

import { parseFeedbackBody } from '../src/http/helpers.js'

test('parseFeedbackBody validates required fields', () => {
  expect(parseFeedbackBody(null)).toEqual({ error: 'invalid JSON' })
  expect(parseFeedbackBody({})).toEqual({ error: 'message is required' })
  expect(parseFeedbackBody({ message: 'ok' })).toEqual({
    error: 'severity must be low|medium|high',
  })
  expect(
    parseFeedbackBody({
      message: 'ok',
      severity: 'low',
      context: 'bad',
    }),
  ).toEqual({ error: 'context must be an object' })
})

test('parseFeedbackBody returns normalized payload', () => {
  expect(
    parseFeedbackBody({
      message: '  response too long  ',
      severity: 'high',
      context: {
        input: 'user input',
        response: 'assistant response',
        note: 'shorter answer',
      },
    }),
  ).toEqual({
    message: 'response too long',
    severity: 'high',
    context: {
      input: 'user input',
      response: 'assistant response',
      note: 'shorter answer',
    },
  })
})
