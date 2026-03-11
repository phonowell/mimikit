export const createControllerViewState = ({
  scroll,
  messageState,
  quote,
  deleteMessages,
  doRender,
}) => {
  let deleteModeEnabled = false
  let stickBottomAfterChoicePanelShift = false

  const renderLastMessages = () => {
    const messages = Array.isArray(messageState.lastMessages)
      ? messageState.lastMessages
      : []
    if (messages.length === 0) return false
    doRender(messages, new Set())
    return true
  }

  return {
    beginChoicePanelLayoutShift: () => {
      stickBottomAfterChoicePanelShift = scroll.isNearBottom()
    },
    endChoicePanelLayoutShift: () => {
      scroll.syncAfterLayoutShift({ stickToBottom: stickBottomAfterChoicePanelShift })
      stickBottomAfterChoicePanelShift = false
    },
    refreshRenderedTimes: () => {
      renderLastMessages()
    },
    setDeleteMode: (enabled) => {
      const nextDeleteMode = Boolean(enabled)
      if (deleteModeEnabled === nextDeleteMode) return deleteModeEnabled
      deleteModeEnabled = nextDeleteMode
      deleteMessages.setDeleteMode(nextDeleteMode)
      if (nextDeleteMode) quote.clear()
      renderLastMessages()
      return deleteModeEnabled
    },
    isDeleteMode: () => deleteModeEnabled,
  }
}
