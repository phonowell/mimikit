export const createControllerCursors = (params) => {
  const {
    getLastMessageCursor,
    setLastMessageCursor,
    getLastStatusEtag,
    setLastStatusEtag,
    getLastMessagesEtag,
    setLastMessagesEtag,
  } = params

  return {
    message: {
      get: () => getLastMessageCursor(),
      set: (value) => {
        setLastMessageCursor(value)
      },
    },
    statusEtag: {
      get: () => getLastStatusEtag(),
      set: (value) => {
        setLastStatusEtag(value)
      },
    },
    messagesEtag: {
      get: () => getLastMessagesEtag(),
      set: (value) => {
        setLastMessagesEtag(value)
      },
    },
  }
}
