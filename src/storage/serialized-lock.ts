const updateQueue = new Map<string, Promise<void>>()

export const runSerialized = async <T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = updateQueue.get(key) ?? Promise.resolve()
  const safePrevious = previous.catch(() => undefined)
  let release!: () => void
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  updateQueue.set(key, next)
  await safePrevious
  try {
    return await fn()
  } finally {
    release()
    if (updateQueue.get(key) === next) updateQueue.delete(key)
  }
}
