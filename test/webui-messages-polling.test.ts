import { expect, test, vi } from 'vitest'

import { createMessageFetchers } from '../src/webui/messages/polling.js'

const buildPollingHarness = () => {
  const messageState = {
    lastMessageCount: 0,
    lastMessageId: null,
    lastLoadingVisible: false,
  }
  const loading = {
    isLoading: () => false,
  }

  return {
    fetchers: createMessageFetchers({
      messageState,
      loading,
      notifications: {
        notifyMessages: () => {},
      },
      doRender: () => null,
      onStatusUpdate: () => {},
      onStatusStale: () => {},
      setDisconnected: () => {},
      getMessagesUrl: () => '/api/messages?limit=50',
      getStatusUrl: () => '/api/status',
      getMessageEtag: () => null,
      setMessageEtag: () => {},
      getStatusEtag: () => null,
      setStatusEtag: () => {},
      getLastMessageCursor: () => null,
      setLastMessageCursor: () => {},
      collectNewMessageIds: () => new Set(),
      hasMessageChange: () => false,
      hasLoadingVisibilityChange: () => false,
      updateMessageState: () => {},
      updateLoadingVisibilityState: () => {},
      applyRenderedState: () => {},
      syncLoadingState: () => {},
      mergeIncomingMessages: (incoming) => incoming,
    }),
  }
}

test('createMessageFetchers throws when messages api returns non-ok', async () => {
  const fetchMock = vi
    .fn<
      (input: string, init?: { headers?: Record<string, string> }) => Promise<Response>
    >()
    .mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ error: 'boom' }),
      headers: { get: () => null },
    } as Response)
  vi.stubGlobal('fetch', fetchMock)

  const { fetchers } = buildPollingHarness()

  await expect(fetchers.fetchAndRenderMessages()).rejects.toThrow('boom')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
