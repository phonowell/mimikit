import { expect, test } from 'vitest'

import {
  extractOpencodeOutput,
  mapOpencodeTextDeltaFromEvent,
  mapOpencodeTextPartStateFromEvent,
} from '../src/providers/opencode-provider-utils.js'

import type { Event, Part } from '@opencode-ai/sdk/v2'

test('extractOpencodeOutput excludes reasoning and ignored text parts', () => {
  const parts: Part[] = [
    {
      id: 'text-1',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'text',
      text: 'Final ',
    },
    {
      id: 'reasoning-1',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'reasoning',
      text: 'hidden thought',
      time: { start: 1 },
    },
    {
      id: 'text-2',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'text',
      text: 'internal',
      ignored: true,
    },
    {
      id: 'text-3',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'text',
      text: 'answer',
    },
  ]

  expect(extractOpencodeOutput(parts)).toBe('Final answer')
})

test('part state + delta mapping keep part-level data for stream filtering', () => {
  const reasoningUpdated: Event = {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'part-reasoning',
        sessionID: 'session-1',
        messageID: 'message-1',
        type: 'reasoning',
        text: 'hidden thought',
        time: { start: 1 },
      },
    },
  }
  expect(mapOpencodeTextPartStateFromEvent(reasoningUpdated, 'session-1')).toEqual({
    messageID: 'message-1',
    partID: 'part-reasoning',
    visible: false,
  })

  const visibleTextUpdated: Event = {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'part-text',
        sessionID: 'session-1',
        messageID: 'message-1',
        type: 'text',
        text: 'answer',
      },
    },
  }
  expect(mapOpencodeTextPartStateFromEvent(visibleTextUpdated, 'session-1')).toEqual({
    messageID: 'message-1',
    partID: 'part-text',
    visible: true,
  })

  const textDelta: Event = {
    type: 'message.part.delta',
    properties: {
      sessionID: 'session-1',
      messageID: 'message-1',
      partID: 'part-text',
      field: 'text',
      delta: 'hi',
    },
  }
  expect(mapOpencodeTextDeltaFromEvent(textDelta, 'session-1')).toEqual({
    messageID: 'message-1',
    partID: 'part-text',
    delta: 'hi',
  })

  const nonTextDelta: Event = {
    type: 'message.part.delta',
    properties: {
      sessionID: 'session-1',
      messageID: 'message-1',
      partID: 'part-reasoning',
      field: 'reasoning_content',
      delta: 'hidden thought',
    },
  }
  expect(mapOpencodeTextDeltaFromEvent(nonTextDelta, 'session-1')).toBeUndefined()
})
