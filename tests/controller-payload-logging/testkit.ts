type LogCall = {
  tag: string
  payload: unknown
}

export const createSpySink = () => {
  const calls: LogCall[] = []
  const sink = (tag: string, payload: unknown) => {
    calls.push({ tag, payload })
  }
  return { calls, sink }
}
