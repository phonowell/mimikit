import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

import { ensureDir } from '../utils/fs.js'

import type { Config, ResumePolicy } from '../config.js'

export type WorkerRequest = {
  config: Config
  prompt: string
  resumePolicy: ResumePolicy
  resumeSessionId?: string
}

export type WorkerResult = {
  output: string
  codexSessionId?: string
}

const MAX_STDOUT_LINES = 400
const MAX_STDOUT_LINE_CHARS = 8_000
const MAX_STDERR_CHARS = 20_000
const MAX_OUTPUT_FILE_BYTES = 1_000_000

const pushLimited = (buffer: string[], value: string, limit: number): void => {
  buffer.push(value)
  if (buffer.length > limit) buffer.splice(0, buffer.length - limit)
}

const appendLimited = (
  current: string,
  chunk: string,
  limit: number,
): string => {
  if (chunk.length >= limit) return chunk.slice(-limit)
  const next = current + chunk
  return next.length > limit ? next.slice(-limit) : next
}

const extractSessionIdFromText = (text: string): string | undefined => {
  const match = text.match(/codex(?:\s+exec)?\s+resume\s+([a-zA-Z0-9_-]+)/i)
  return match?.[1]
}

const extractSessionIdFromEvent = (event: unknown): string | undefined => {
  if (!event || typeof event !== 'object') return undefined
  const record = event as Record<string, unknown>
  if (typeof record.thread_id === 'string') return record.thread_id
  const thread = record.thread as Record<string, unknown> | undefined
  if (thread && typeof thread.id === 'string') return thread.id
  return undefined
}

const extractOutputFromEvent = (event: unknown): string | undefined => {
  if (!event || typeof event !== 'object') return undefined
  const record = event as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text
  if (typeof record.text === 'string') return record.text
  if (record.message && typeof record.message === 'object') {
    const message = record.message as Record<string, unknown>
    if (typeof message.content === 'string') return message.content
  }
  return undefined
}

const readOutputFile = async (
  filePath: string,
): Promise<string | undefined> => {
  let handle: fs.FileHandle | undefined
  try {
    const stats = await fs.stat(filePath)
    if (stats.size === 0) return undefined
    const length = Math.min(stats.size, MAX_OUTPUT_FILE_BYTES)
    const start = Math.max(0, stats.size - length)
    const buffer = Buffer.alloc(length)
    handle = await fs.open(filePath, 'r')
    await handle.read(buffer, 0, length, start)
    const trimmed = buffer.toString('utf8').trim()
    return trimmed.length > 0 ? trimmed : undefined
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return undefined
    throw error
  } finally {
    if (handle) await handle.close()
  }
}

export const runWorker = async (
  request: WorkerRequest,
): Promise<WorkerResult> => {
  const bin = request.config.codexBin ?? 'codex'
  await ensureDir(request.config.stateDir)
  const outputFile = path.join(
    request.config.stateDir,
    `last-message-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  )

  let stdoutRl: readline.Interface | undefined
  let timeout: NodeJS.Timeout | undefined
  let hardKillTimeout: NodeJS.Timeout | undefined
  const timeoutState = { triggered: false }

  try {
    const args: string[] = [
      'exec',
      '--json',
      '--output-last-message',
      outputFile,
      '--dangerously-bypass-approvals-and-sandbox',
    ]

    if (request.config.codexModel)
      args.push('--model', request.config.codexModel)

    if (request.config.codexProfile)
      args.push('--profile', request.config.codexProfile)

    if (request.config.codexSandbox)
      args.push('--sandbox', request.config.codexSandbox)

    if (request.config.codexFullAuto) args.push('--full-auto')

    if (request.resumePolicy !== 'never' && request.resumeSessionId)
      args.push('resume', request.resumeSessionId)

    args.push('-')

    const child = spawn(bin, args, {
      cwd: request.config.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdin.write(request.prompt)
    child.stdin.end()

    let sessionId: string | undefined
    let lastOutput: string | undefined
    const stdoutLines: string[] = []
    let stderr = ''

    stdoutRl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })

    stdoutRl.on('line', (line) => {
      const cappedLine =
        line.length > MAX_STDOUT_LINE_CHARS
          ? line.slice(-MAX_STDOUT_LINE_CHARS)
          : line
      pushLimited(stdoutLines, cappedLine, MAX_STDOUT_LINES)
      try {
        const event = JSON.parse(line) as unknown
        sessionId = sessionId ?? extractSessionIdFromEvent(event)
        lastOutput = extractOutputFromEvent(event) ?? lastOutput
      } catch {
        sessionId = sessionId ?? extractSessionIdFromText(line)
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString('utf8'), MAX_STDERR_CHARS)
    })

    timeout = setTimeout(() => {
      timeoutState.triggered = true
      child.kill('SIGTERM')
      hardKillTimeout = setTimeout(() => {
        child.kill('SIGKILL')
      }, 2000)
    }, request.config.timeoutMs)

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (code) => resolve(code ?? 0))
    })

    stdoutRl.close()
    stdoutRl = undefined

    const stderrText = stderr.trim()
    if (timeoutState.triggered) {
      throw new Error(
        `codex exec timed out after ${request.config.timeoutMs}ms`,
      )
    }
    if (exitCode !== 0) {
      const message =
        stderrText.length > 0
          ? stderrText
          : `codex exec failed with code ${exitCode}`
      throw new Error(message)
    }

    const fileOutput = await readOutputFile(outputFile)
    const output = fileOutput ?? lastOutput ?? stdoutLines.join('\n').trim()
    if (!output) {
      const message =
        stderrText.length > 0 ? stderrText : 'codex exec returned no output'
      throw new Error(message)
    }

    const result: WorkerResult = { output }
    if (sessionId !== undefined) result.codexSessionId = sessionId

    return result
  } finally {
    if (timeout) clearTimeout(timeout)
    if (hardKillTimeout) clearTimeout(hardKillTimeout)
    if (stdoutRl) stdoutRl.close()
    await fs.unlink(outputFile).catch(() => undefined)
  }
}
