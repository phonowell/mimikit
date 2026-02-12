const readMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const readCode = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : undefined
  }
  if (typeof value === 'number') return String(value)
  return undefined
}

const parseErrorNode = (
  value: unknown,
): { message?: string; code?: string; cause?: unknown } => {
  if (value instanceof Error) {
    const errorWithCode = value as Error & { code?: unknown; cause?: unknown }
    const code = readCode(errorWithCode.code)
    return {
      ...(value.message ? { message: value.message } : {}),
      ...(code ? { code } : {}),
      ...(errorWithCode.cause !== undefined
        ? { cause: errorWithCode.cause }
        : {}),
    }
  }
  if (!value || typeof value !== 'object') return {}
  const node = value as {
    message?: unknown
    code?: unknown
    cause?: unknown
  }
  const message = readMessage(node.message)
  const code = readCode(node.code)
  return {
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
    ...(node.cause !== undefined ? { cause: node.cause } : {}),
  }
}

const formatCause = (value: unknown): string | undefined => {
  const nodes: string[] = []
  const details: string[] = []
  let current: unknown = value
  const seen = new Set<unknown>()
  for (let depth = 0; depth < 4 && current !== undefined; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) break
      seen.add(current)
    }
    const parsed = parseErrorNode(current)
    const message = parsed.message ? parsed.message.trim() : ''
    const code = parsed.code ? parsed.code.trim() : ''
    const part = [message, code ? `code=${code}` : '']
      .filter(Boolean)
      .join(', ')
    if (part) nodes.push(part)
    if (part && depth > 0) details.push(part)
    if (parsed.cause === undefined || parsed.cause === current) break
    current = parsed.cause
  }
  if (details.length > 0) return details.join(' -> ')
  if (nodes.length <= 1) return undefined
  return nodes.slice(1).join(' -> ')
}

export const formatLlmError = (prefix: string, err: unknown): string => {
  if (err instanceof Error) {
    const cause = formatCause(err)
    if (cause) return `${prefix} failed: ${err.message} (cause: ${cause})`
    return `${prefix} failed: ${err.message}`
  }
  return `${prefix} failed: ${String(err)}`
}
