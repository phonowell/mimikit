import type { ProviderResult } from './types.js'
import type { TokenUsage } from '../types/index.js'

export const elapsedMsSince = (startedAt: number): number =>
  Math.max(0, Date.now() - startedAt)

export const bindExternalAbort = (params: {
  controller: AbortController
  abortSignal?: AbortSignal
  onAbort?: () => void
}): (() => void) => {
  const { abortSignal, controller, onAbort } = params
  if (!abortSignal) return () => undefined
  const abort = () => {
    onAbort?.()
    if (!controller.signal.aborted) controller.abort()
  }
  if (abortSignal.aborted) abort()
  else abortSignal.addEventListener('abort', abort)
  return () => abortSignal.removeEventListener('abort', abort)
}

export const createTimeoutGuard = (params: {
  controller: AbortController
  timeoutMs: number
  onTimeout?: () => void
}) => {
  const { controller, timeoutMs, onTimeout } = params
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = (): void => {
    clearTimeout(timer)
  }
  const arm = (): void => {
    if (timeoutMs <= 0) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      onTimeout?.()
      if (!controller.signal.aborted) controller.abort()
    }, timeoutMs)
  }
  return { arm, clear }
}

export const buildProviderResult = (params: {
  startedAt: number
  output: string
  usage?: TokenUsage
  threadId?: string | null
}): ProviderResult => ({
  output: params.output,
  elapsedMs: elapsedMsSince(params.startedAt),
  ...(params.usage ? { usage: params.usage } : {}),
  ...(params.threadId !== undefined ? { threadId: params.threadId } : {}),
})
