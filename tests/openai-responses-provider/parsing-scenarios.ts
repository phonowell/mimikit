import { describe, expect, test } from 'vitest'

import {
  parseResponsesPayload,
  parseResponsesSse,
  summarizeResponsesPayload,
} from '../../src/execution/providers/openai-responses-provider.js'

describe('parseResponsesSse', () => {
  test('extracts output and usage from response.completed event', () => {
    const sse = [
      'event: response.created',
      'data: {"type":"response.created"}',
      '',
      'event: response.output_text.done',
      'data: {"type":"response.output_text.done","text":"fallback"}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":10,"output_tokens":3,"total_tokens":13,"input_tokens_details":{"cached_tokens":2}}}}',
      '',
    ].join('\n')

    const parsed = parseResponsesSse(sse)

    expect(parsed.output).toBe('hello')
    expect(parsed.usage).toEqual({
      input: 10,
      output: 3,
      total: 13,
      inputCacheRead: 2,
    })
  })

  test('accepts SSE data lines without a following space', () => {
    const sse = [
      'event: response.completed',
      'data:{"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"hello-no-space"}]}],"usage":{"input_tokens":2,"output_tokens":2,"total_tokens":4}}}',
      '',
    ].join('\n')

    const parsed = parseResponsesSse(sse)

    expect(parsed.output).toBe('hello-no-space')
    expect(parsed.usage).toEqual({
      input: 2,
      output: 2,
      total: 4,
    })
  })

  test('throws failed message from response.failed event', () => {
    const sse = [
      'event: response.failed',
      'data: {"type":"response.failed","response":{"error":{"message":"upstream failed"}}}',
      '',
    ].join('\n')

    expect(() => parseResponsesSse(sse)).toThrow('upstream failed')
  })

  test('throws incomplete reason from response.incomplete event', () => {
    const sse = [
      'event: response.incomplete',
      'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"type":"message","content":[{"type":"output_text","text":"partial"}]}]}}',
      '',
    ].join('\n')

    expect(() => parseResponsesSse(sse)).toThrow(
      'responses_incomplete:max_output_tokens',
    )
  })
})

describe('parseResponsesPayload', () => {
  test('extracts output and usage from json response payload', () => {
    const payload = JSON.stringify({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'json-ok' }],
        },
      ],
      usage: {
        input_tokens: 8,
        output_tokens: 4,
        total_tokens: 12,
      },
    })

    const parsed = parseResponsesPayload(payload)

    expect(parsed.output).toBe('json-ok')
    expect(parsed.usage).toEqual({
      input: 8,
      output: 4,
      total: 12,
    })
  })

  test('throws incomplete reason from json response payload', () => {
    const payload = JSON.stringify({
      status: 'incomplete',
      incomplete_details: {
        reason: 'max_output_tokens',
      },
      output_text: 'partial',
    })

    expect(() => parseResponsesPayload(payload)).toThrow(
      'responses_incomplete:max_output_tokens',
    )
  })
})

describe('summarizeResponsesPayload', () => {
  test('summarizes missing completed SSE responses for diagnostics', () => {
    const sse = [
      'event: response.output_text.done',
      'data: {"type":"response.output_text.done","text":"partial"}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed"',
      '',
    ].join('\n')

    expect(summarizeResponsesPayload(sse)).toEqual({
      chunkCount: 2,
      parseErrorCount: 1,
      hasCompletedEvent: false,
      hasIncompleteEvent: false,
      hasFailedEvent: false,
      lastEventTypes: ['response.output_text.done', '<parse_error>'],
      tailPreview: sse.slice(-240),
    })
  })
})
