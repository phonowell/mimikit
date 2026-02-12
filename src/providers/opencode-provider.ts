import { spawn } from 'node:child_process'

import {
  parseJsonLine,
  readEventText,
  readEventUsage,
  readSessionId,
  resolveOpencodeModel,
} from './opencode-provider-utils.js'

import type {
  OpencodeProviderRequest,
  Provider,
  ProviderResult,
} from './types.js'
import type { TokenUsage } from '../types/index.js'

const OPENCODE_BIN = 'opencode'
const STDERR_MAX_CHUNKS = 12
const STDOUT_MAX_CHUNKS = 12

const runOpencode = async (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> => {
  const startedAt = Date.now()
  const args: string[] = [
    'run',
    request.prompt,
    '--format',
    'json',
    '--log-level',
    'ERROR',
    '--model',
    resolveOpencodeModel(request.model),
  ]
  if (request.threadId) args.push('--session', request.threadId)
  if (request.modelReasoningEffort)
    args.push('--variant', request.modelReasoningEffort)

  const child = spawn(OPENCODE_BIN, args, {
    cwd: request.workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  const lifecycle = {
    timedOut: false,
    externallyAborted: false,
  }
  let done = false
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const stderrChunks: string[] = []
  const rawStdoutChunks: string[] = []
  const outputChunks: string[] = []
  let usage: TokenUsage | undefined
  let sessionId: string | undefined
  let stdoutBuffer = ''

  const stopChild = (): void => {
    if (done || child.killed) return
    child.kill('SIGTERM')
    killTimer = setTimeout(() => {
      if (!done && !child.killed) child.kill('SIGKILL')
    }, 1_500)
  }

  const onAbort = (): void => {
    lifecycle.externallyAborted = true
    stopChild()
  }

  const storeChunk = (list: string[], value: string, max: number): void => {
    if (!value) return
    list.push(value)
    if (list.length > max) list.splice(0, list.length - max)
  }

  const processStdoutLine = (line: string): void => {
    const normalized = line.trim()
    if (!normalized) return
    const event = parseJsonLine(normalized)
    if (!event) {
      storeChunk(rawStdoutChunks, normalized, STDOUT_MAX_CHUNKS)
      return
    }
    sessionId = sessionId ?? readSessionId(event)
    const text = readEventText(event)
    if (text) outputChunks.push(text)
    usage = readEventUsage(event) ?? usage
  }

  if (request.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      lifecycle.timedOut = true
      stopChild()
    }, request.timeoutMs)
  }
  if (request.abortSignal) {
    if (request.abortSignal.aborted) onAbort()
    else request.abortSignal.addEventListener('abort', onAbort)
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk
    for (;;) {
      const index = stdoutBuffer.indexOf('\n')
      if (index < 0) break
      processStdoutLine(stdoutBuffer.slice(0, index))
      stdoutBuffer = stdoutBuffer.slice(index + 1)
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    storeChunk(stderrChunks, chunk.trim(), STDERR_MAX_CHUNKS)
  })

  let exitCode: number | null = null
  let exitSignal: NodeJS.Signals | null = null
  try {
    const result = await new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    exitCode = result.code
    exitSignal = result.signal
  } finally {
    done = true
    clearTimeout(timeoutTimer)
    clearTimeout(killTimer)
    if (request.abortSignal)
      request.abortSignal.removeEventListener('abort', onAbort)
  }

  if (stdoutBuffer.trim()) processStdoutLine(stdoutBuffer)
  const elapsedMs = Math.max(0, Date.now() - startedAt)
  if (lifecycle.timedOut) {
    throw new Error(
      `[provider:opencode] timed out after ${request.timeoutMs}ms`,
    )
  }

  if (lifecycle.externallyAborted)
    throw new Error('[provider:opencode] aborted')
  if (exitCode !== 0) {
    const details = [...stderrChunks, ...rawStdoutChunks]
      .filter(Boolean)
      .join('\n')
      .trim()
    const suffix = details ? `: ${details}` : ''
    const signalSuffix = exitSignal ? ` signal=${exitSignal}` : ''
    throw new Error(
      `[provider:opencode] opencode run failed (exit=${String(exitCode)}${signalSuffix})${suffix}`,
    )
  }

  const output = outputChunks.join('').trim()
  return {
    output,
    elapsedMs,
    ...(usage ? { usage } : {}),
    threadId: sessionId ?? request.threadId ?? null,
  }
}

export const opencodeProvider: Provider<OpencodeProviderRequest> = {
  id: 'opencode',
  run: runOpencode,
}
