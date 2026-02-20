import { expect, test } from 'vitest'

import {
  extractOpencodeOutput,
} from '../src/providers/opencode-provider-utils.js'
import {
  isTransientProviderError,
  startUsageStreamMonitor,
} from '../src/providers/opencode-provider-stream.js'
import {
  ProviderError,
  readProviderErrorCode,
} from '../src/providers/provider-error.js'
import {
  createMessageState,
  hasStreamChange,
  updateStreamState,
} from '../webui/messages/state.js'

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

  const timeoutError = new ProviderError({
    code: 'provider_timeout',
    message: '[provider:opencode] timed out after 90000ms',
    retryable: true,
  })
  expect(readProviderErrorCode(timeoutError)).toBe('provider_timeout')
  expect(isTransientProviderError(timeoutError)).toBe(true)

  const sdkError = new ProviderError({
    code: 'provider_sdk_failure',
    message: '[provider:opencode] sdk run failed: invalid response',
    retryable: false,
  })
  expect(readProviderErrorCode(sdkError)).toBe('provider_sdk_failure')
  expect(isTransientProviderError(sdkError)).toBe(false)
})

test('stream monitor restores visible streaming while filtering hidden parts and triggers webui stream state', async () => {
  const now = Date.now()
  const sdkResponderRole = ['a', 's', 's', 'i', 's', 't', 'a', 'n', 't'].join(
    '',
  )
  const script: Array<{ delayMs?: number; event: Event }> = [
    {
      event: {
        type: 'message.updated',
        properties: {
          info: {
            id: 'message-1',
            role: sdkResponderRole,
            sessionID: 'session-1',
            time: { created: now },
          },
        },
      } as unknown as Event,
    },
    {
      event: {
        type: 'message.part.delta',
        properties: {
          sessionID: 'session-1',
          messageID: 'message-1',
          partID: 'part-unknown',
          field: 'text',
          delta: 'Hello ',
        },
      } as unknown as Event,
    },
    {
      delayMs: 360,
      event: {
        type: 'message.updated',
        properties: {
          info: {
            id: 'message-1',
            role: sdkResponderRole,
            sessionID: 'session-1',
            time: { created: now },
          },
        },
      } as unknown as Event,
    },
    {
      event: {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'part-hidden',
            sessionID: 'session-1',
            messageID: 'message-1',
            type: 'text',
            text: 'secret',
            ignored: true,
          },
        },
      } as unknown as Event,
    },
    {
      event: {
        type: 'message.part.delta',
        properties: {
          sessionID: 'session-1',
          messageID: 'message-1',
          partID: 'part-hidden',
          field: 'text',
          delta: 'secret',
        },
      } as unknown as Event,
    },
    {
      event: {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'part-visible',
            sessionID: 'session-1',
            messageID: 'message-1',
            type: 'text',
            text: 'world',
          },
        },
      } as unknown as Event,
    },
    {
      event: {
        type: 'message.part.delta',
        properties: {
          sessionID: 'session-1',
          messageID: 'message-1',
          partID: 'part-visible',
          field: 'text',
          delta: 'world',
        },
      } as unknown as Event,
    },
  ]

  const client = {
    event: {
      subscribe: async () => ({
        stream: (async function* () {
          for (const step of script) {
            if (step.delayMs && step.delayMs > 0)
              await new Promise((resolve) => setTimeout(resolve, step.delayMs))
            yield step.event
          }
        })(),
      }),
    },
  }

  const streamedDeltas: string[] = []
  const monitor = startUsageStreamMonitor({
    client: client as never,
    workDir: process.cwd(),
    sessionID: 'session-1',
    minCreatedAt: now,
    abortSignal: new AbortController().signal,
    onUsage: () => undefined,
    onTextDelta: (delta) => streamedDeltas.push(delta),
  })
  await monitor.done

  expect(streamedDeltas).toEqual(['Hello ', 'world'])

  const webuiState = createMessageState()
  let streamedText = ''
  for (const delta of streamedDeltas) {
    streamedText += delta
    const streamPayload = { id: 'manager-stream', text: streamedText }
    expect(hasStreamChange(webuiState, streamPayload)).toBe(true)
    updateStreamState(webuiState, streamPayload)
  }
  expect(
    hasStreamChange(webuiState, { id: 'manager-stream', text: streamedText }),
  ).toBe(false)
})
