import { spawn } from 'node:child_process'

import { resolveCodexTargets, type SpawnTarget } from './codex/resolve.js'

import type { TokenUsage } from './protocol.js'

export type CodexOptions = {
  prompt: string
  sessionId?: string | undefined
  workDir: string
  model?: string | undefined
  timeout: number
}

export type CodexResult = {
  output: string
  sessionId?: string | undefined
  usage?: TokenUsage
}

const spawnCandidate = (
  target: SpawnTarget,
  args: string[],
  options: Parameters<typeof spawn>[2],
): Promise<ReturnType<typeof spawn>> =>
  new Promise((resolve, reject) => {
    const proc = spawn(target.command, [...target.args, ...args], options)
    const onError = (error: NodeJS.ErrnoException) => {
      proc.off('spawn', onSpawn)
      reject(error)
    }
    const onSpawn = () => {
      proc.off('error', onError)
      resolve(proc)
    }
    proc.once('error', onError)
    proc.once('spawn', onSpawn)
  })

const spawnCodex = async (
  args: string[],
  options: Parameters<typeof spawn>[2],
): Promise<ReturnType<typeof spawn>> => {
  const targets = resolveCodexTargets()
  const errors: string[] = []

  for (const target of targets) {
    try {
      return await spawnCandidate(target, args, options)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      const code = err.code ? String(err.code) : 'unknown'
      errors.push(`${target.label}:${code}`)
    }
  }

  const detail = errors.length ? ` Tried: ${errors.join(', ')}` : ''
  throw new Error(`Unable to spawn codex.${detail}`)
}

export const execCodex = (options: CodexOptions): Promise<CodexResult> =>
  new Promise((resolve, reject) => {
    const args: string[] = ['exec']

    // Resume existing session or start new
    if (options.sessionId) args.push('resume', options.sessionId)

    args.push('--dangerously-bypass-approvals-and-sandbox', '--json')

    if (options.model) args.push('--model', options.model)

    spawnCodex(args, {
      cwd: options.workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .then((proc) => {
        let stdout = ''
        let stderr = ''
        let finished = false
        let timedOut = false
        const timeoutMs = Math.max(0, options.timeout)
        const timeoutId =
          timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true
                proc.kill()
              }, timeoutMs)
            : undefined

        const finish = (fn: () => void) => {
          if (finished) return
          finished = true
          if (timeoutId) clearTimeout(timeoutId)
          fn()
        }

        if (proc.stdout) {
          proc.stdout.on('data', (data) => {
            stdout += data.toString()
          })
        }
        if (proc.stderr) {
          proc.stderr.on('data', (data) => {
            stderr += data.toString()
          })
        }

        if (proc.stdin) {
          proc.stdin.write(options.prompt)
          proc.stdin.end()
        }

        proc.on('close', (code) => {
          finish(() => {
            if (timedOut) {
              reject(new Error(`codex timed out after ${timeoutMs}ms`))
              return
            }
            if (code !== 0) {
              reject(new Error(`codex exited with code ${code}: ${stderr}`))
              return
            }
            const { sessionId, lastMessage, usage } = parseJsonlOutput(stdout)
            const result: CodexResult = { output: lastMessage, sessionId }
            if (usage !== undefined) result.usage = usage
            resolve(result)
          })
        })

        proc.on('error', (error) => {
          finish(() => reject(error))
        })
      })
      .catch((error) => {
        reject(error)
      })
  })

type JsonlEvent = {
  type?: string
  thread_id?: string
  item?: { type?: string; text?: string; [key: string]: unknown }
  response?: { usage?: unknown; metrics?: unknown; [key: string]: unknown }
  usage?: unknown
  [key: string]: unknown
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return undefined
  return num
}

const normalizeUsage = (value: unknown): TokenUsage | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const input = toNumber(
    record.input_tokens ??
      record.prompt_tokens ??
      record.input_tokens_total ??
      record.input,
  )
  const output = toNumber(
    record.output_tokens ?? record.completion_tokens ?? record.output,
  )
  const total = toNumber(record.total_tokens ?? record.total ?? record.tokens)

  if (input === undefined && output === undefined && total === undefined)
    return undefined

  const usage: TokenUsage = {}
  if (input !== undefined) usage.input = input
  if (output !== undefined) usage.output = output
  if (total !== undefined) usage.total = total
  if (
    usage.total === undefined &&
    usage.input !== undefined &&
    usage.output !== undefined
  )
    usage.total = usage.input + usage.output
  return usage
}

const mergeUsage = (
  base: TokenUsage | undefined,
  next: TokenUsage,
): TokenUsage => {
  const merged: TokenUsage = { ...(base ?? {}), ...next }
  if (
    merged.total === undefined &&
    merged.input !== undefined &&
    merged.output !== undefined
  )
    merged.total = merged.input + merged.output
  return merged
}

const extractUsageFromEvent = (event: JsonlEvent): TokenUsage | undefined => {
  const direct = normalizeUsage(event.usage)
  if (direct) return direct
  if (event.response && typeof event.response === 'object') {
    const responseRecord = event.response as Record<string, unknown>
    const responseUsage = normalizeUsage(responseRecord.usage)
    if (responseUsage) return responseUsage
    const { metrics } = responseRecord
    if (metrics && typeof metrics === 'object') {
      const metricsUsage = normalizeUsage(
        (metrics as Record<string, unknown>).usage,
      )
      if (metricsUsage) return metricsUsage
    }
  }
  if (event.item && typeof event.item === 'object') {
    const itemUsage = normalizeUsage(
      (event.item as Record<string, unknown>).usage,
    )
    if (itemUsage) return itemUsage
  }
  return undefined
}

const parseJsonlOutput = (
  output: string,
): {
  sessionId: string | undefined
  lastMessage: string
  usage: TokenUsage | undefined
} => {
  let sessionId: string | undefined
  let lastMessage = ''
  let usage: TokenUsage | undefined

  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as JsonlEvent
      if (event.type === 'thread.started' && event.thread_id)
        sessionId = event.thread_id

      if (
        event.type === 'item.completed' &&
        event.item?.type === 'agent_message' &&
        event.item.text
      )
        lastMessage = event.item.text

      const foundUsage = extractUsageFromEvent(event)
      if (foundUsage) usage = mergeUsage(usage, foundUsage)
    } catch {
      // skip non-JSON lines
    }
  }

  return { sessionId, lastMessage, usage }
}
