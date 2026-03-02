export const createMessageState = () => ({
  lastMessageSignature: '',
  lastAgentMessageId: null,
  lastLoadingVisible: false,
  awaitingReply: false,
  lastMessageIds: new Set(),
  lastMessages: [],
  lastStreamSignature: '',
})

const collectMessageIds = (messages) => {
  const ids = new Set()
  for (const msg of messages) 
    if (msg?.id !== null && msg?.id !== undefined) ids.add(msg.id)
  
  return ids
}

export const collectNewMessageIds = (state, messages) => {
  if (state.lastMessageIds.size === 0) return new Set()
  const ids = new Set()
  for (const msg of messages) {
    const id = msg?.id
    if (id !== null && id !== undefined && !state.lastMessageIds.has(id)) ids.add(id)
  }
  return ids
}

const toMessageSignature = (messages) =>
  JSON.stringify(
    messages.map((message) => ({
      id: message?.id ?? null,
      role: message?.role ?? null,
      visibility: message?.visibility ?? null,
      text: message?.text ?? '',
      createdAt: message?.createdAt ?? null,
      quote: message?.quote ?? null,
      focusId: message?.focusId ?? null,
      usage: message?.usage ?? null,
      elapsedMs: message?.elapsedMs ?? null,
    })),
  )

export const hasMessageChange = (state, messages) =>
  toMessageSignature(messages) !== state.lastMessageSignature

export const hasLoadingVisibilityChange = (state, loadingVisible) =>
  state.lastLoadingVisible !== loadingVisible

const normalizeStreamSignature = (streamMessage) => {
  if (!streamMessage || typeof streamMessage !== 'object') return ''
  const id =
    streamMessage.id === null || streamMessage.id === undefined
      ? ''
      : String(streamMessage.id)
  const text =
    typeof streamMessage.text === 'string' ? streamMessage.text : String(streamMessage.text ?? '')
  const usage =
    streamMessage.usage && typeof streamMessage.usage === 'object'
      ? JSON.stringify(streamMessage.usage)
      : ''
  if (!id && !text) return ''
  return `${id}\n${text}\n${usage}`
}

export const hasStreamChange = (state, streamMessage) =>
  state.lastStreamSignature !== normalizeStreamSignature(streamMessage)

export const updateMessageState = (state, messages) => {
  state.lastMessageSignature = toMessageSignature(messages)
  state.lastMessageIds = collectMessageIds(messages)
  state.lastMessages = [...messages]
}

export const updateLoadingVisibilityState = (state, loadingVisible) => {
  state.lastLoadingVisible = loadingVisible
}

export const updateStreamState = (state, streamMessage) => {
  state.lastStreamSignature = normalizeStreamSignature(streamMessage)
}

export const applyRenderedState = (state, rendered, { loading, syncLoadingState }) => {
  if (rendered?.latestAgentId && rendered.latestAgentId !== state.lastAgentMessageId) {
    state.lastAgentMessageId = rendered.latestAgentId
    state.awaitingReply = false
    loading.setLoading(false)
  }
  syncLoadingState()
}
