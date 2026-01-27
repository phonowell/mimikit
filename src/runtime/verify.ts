import { spawn } from 'node:child_process'

export type VerifyResult = {
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
  error?: string
}

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

  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  child.stdout.on('data', (chunk: Buffer) =>
    stdoutChunks.push(chunk.toString('utf8')),
  )
  child.stderr.on('data', (chunk: Buffer) =>
    stderrChunks.push(chunk.toString('utf8')),
  )

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

  const stdout = stdoutChunks.join('').trim()
  const stderr = stderrChunks.join('').trim()

  if (exitCode !== 0) {
    const error =
      stderr.length > 0 ? stderr : `verify command failed with code ${exitCode}`
    return { ok: false, exitCode, stdout, stderr, error }
  }

  return { ok: true, exitCode, stdout, stderr }
}
