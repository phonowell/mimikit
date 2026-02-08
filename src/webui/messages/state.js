export const createMessageState = () => ({
  lastMessageCount: 0,
  lastMessageId: null,
  lastMessageRole: null,
  lastAgentMessageId: null,
  lastLoadingVisible: false,
  awaitingReply: false,
  lastMessageIds: new Set(),
  lastMessages: [],
})

const collectMessageIds = (messages) => {
  const ids = new Set()
  for (const msg of messages) {
    if (msg?.id != null) ids.add(msg.id)
  }
  return ids
}

export const collectNewMessageIds = (state, messages) => {
  if (state.lastMessageIds.size === 0) return new Set()
  const ids = new Set()
  for (const msg of messages) {
    const id = msg?.id
    if (id != null && !state.lastMessageIds.has(id)) ids.add(id)
  }
  return ids
}

export const hasMessageChange = (state, messages, newestId) =>
  messages.length !== state.lastMessageCount || newestId !== state.lastMessageId

export const hasLoadingVisibilityChange = (state, loadingVisible) =>
  state.lastLoadingVisible !== loadingVisible

export const updateMessageState = (state, messages, newestId) => {
  state.lastMessageCount = messages.length
  state.lastMessageId = newestId
  state.lastMessageIds = collectMessageIds(messages)
  state.lastMessages = [...messages]
}

export const updateLoadingVisibilityState = (state, loadingVisible) => {
  state.lastLoadingVisible = loadingVisible
}

export const applyRenderedState = (state, rendered, { loading, syncLoadingState }) => {
  if (rendered?.latestAgentId && rendered.latestAgentId !== state.lastAgentMessageId) {
    state.lastAgentMessageId = rendered.latestAgentId
    state.awaitingReply = false
    loading.setLoading(false)
  }
  if (rendered?.lastRole != null) state.lastMessageRole = rendered.lastRole
  if (rendered?.lastIsAgent) state.awaitingReply = false
  syncLoadingState()
}

export const clearMessageState = (state) => {
  state.lastMessageCount = 0
  state.lastMessageId = null
  state.lastAgentMessageId = null
  state.lastMessageRole = null
  state.lastMessageIds = new Set()
  state.lastMessages = []
  state.lastLoadingVisible = false
  state.awaitingReply = false
}
