import { spawn } from 'node:child_process'

export type VerifyResult = {
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
  error?: string
}

const MAX_VERIFY_STDOUT_CHARS = 20_000
const MAX_VERIFY_STDERR_CHARS = 20_000

type ParsedCommand = {
  command: string
  args: string[]
}

const parseCommandLine = (input: string): ParsedCommand => {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < input.length) {
    const char = input[i] ?? ''
    if (quote) {
      if (char === quote) {
        quote = null
        i += 1
        continue
      }
      if (quote === '"' && char === '\\' && i + 1 < input.length) {
        current += input[i + 1]
        i += 2
        continue
      }
      current += char
      i += 1
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      i += 1
      continue
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      i += 1
      continue
    }
    if (char === '\\' && i + 1 < input.length) {
      current += input[i + 1]
      i += 2
      continue
    }
    current += char
    i += 1
  }

  if (quote) throw new Error('verifyCommand has an unclosed quote')
  if (current.length > 0) tokens.push(current)
  if (tokens.length === 0) throw new Error('verifyCommand is empty')

  return { command: tokens[0] ?? '', args: tokens.slice(1) }
}

export const runVerifyCommand = async (
  command: string,
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<VerifyResult> => {
  const parsed = parseCommandLine(command)
  const child = spawn(parsed.command, parsed.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  const appendLimited = (current: string, chunk: string, limit: number) => {
    if (chunk.length >= limit) return chunk.slice(-limit)
    const next = current + chunk
    return next.length > limit ? next.slice(-limit) : next
  }

  child.stdout.on('data', (chunk: Buffer) => {
    stdout = appendLimited(
      stdout,
      chunk.toString('utf8'),
      MAX_VERIFY_STDOUT_CHARS,
    )
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = appendLimited(
      stderr,
      chunk.toString('utf8'),
      MAX_VERIFY_STDERR_CHARS,
    )
  })

  let hardKillTimeout: NodeJS.Timeout | undefined
  const timeout = setTimeout(() => {
    child.kill('SIGTERM')
    hardKillTimeout = setTimeout(() => {
      child.kill('SIGKILL')
    }, 2000)
  }, options.timeoutMs)

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 0))
  })

  clearTimeout(timeout)
  if (hardKillTimeout) clearTimeout(hardKillTimeout)

  const trimmedStdout = stdout.trim()
  const trimmedStderr = stderr.trim()

  if (exitCode !== 0) {
    const error =
      trimmedStderr.length > 0
        ? trimmedStderr
        : trimmedStdout.length > 0
          ? trimmedStdout
          : `verify command failed with code ${exitCode}`
    return {
      ok: false,
      exitCode,
      stdout: trimmedStdout,
      stderr: trimmedStderr,
      error,
    }
  }

  return { ok: true, exitCode, stdout: trimmedStdout, stderr: trimmedStderr }
}
