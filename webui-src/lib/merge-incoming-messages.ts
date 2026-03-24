type MessageLike = { id?: unknown }

type Params<T extends MessageLike> = {
  mode: string
  lastMessages: readonly T[]
  incoming: readonly T[]
  limit: number
}

export const mergeIncomingMessages = <T extends MessageLike>({
  mode,
  lastMessages,
  incoming,
  limit,
}: Params<T>): T[] => {
  if (mode !== 'delta' || lastMessages.length === 0)
    return incoming.slice(Math.max(0, incoming.length - limit))

  const merged = [...lastMessages]
  const indexById = new Map<string, number>()
  for (let index = 0; index < merged.length; index += 1) {
    const id = merged[index]?.id
    if (id === null || id === undefined) continue
    indexById.set(String(id), index)
  }
  for (const message of incoming) {
    const id = message?.id
    if (id === null || id === undefined) {
      merged.push(message)
      continue
    }
    const idKey = String(id)
    const existingIndex = indexById.get(idKey)
    if (existingIndex === undefined) {
      indexById.set(idKey, merged.length)
      merged.push(message)
      continue
    }
    merged[existingIndex] = message
  }
  return merged.slice(Math.max(0, merged.length - limit))
}
