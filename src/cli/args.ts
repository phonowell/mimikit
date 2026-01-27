import type { ResumePolicy } from '../config.js'

export type AskArgs = {
  sessionKey: string
  message: string
  resume?: ResumePolicy
  verifyCommand?: string
  maxIterations?: number
}

export type AskParseResult =
  | { ok: true; value: AskArgs }
  | { ok: false; error: string }

const DEFAULT_SESSION_KEY = 'default'

const parseResumePolicy = (
  value: string | undefined,
): ResumePolicy | undefined => {
  if (!value) return undefined
  if (value === 'auto' || value === 'always' || value === 'never') return value
  return undefined
}

export const parseAskArgs = (args: string[]): AskParseResult => {
  let sessionKey: string | undefined
  let messageFlag: string | undefined
  let resume: ResumePolicy | undefined
  let verifyCommand: string | undefined
  let maxIterations: number | undefined
  const positionals: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === undefined) continue
    if (arg === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    if (arg === '--session') {
      const value = args[i + 1]
      if (!value) return { ok: false, error: '--session requires a value' }
      sessionKey = value
      i += 1
      continue
    }
    if (arg === '--message') {
      const value = args[i + 1]
      if (!value) return { ok: false, error: '--message requires a value' }
      messageFlag = value
      i += 1
      continue
    }
    if (arg === '--resume') {
      const value = args[i + 1]
      if (!value) return { ok: false, error: '--resume requires a value' }
      const parsed = parseResumePolicy(value)
      if (!parsed)
        return { ok: false, error: '--resume must be auto|always|never' }
      resume = parsed
      i += 1
      continue
    }
    if (arg === '--verify') {
      const value = args[i + 1]
      if (!value) return { ok: false, error: '--verify requires a value' }
      verifyCommand = value
      i += 1
      continue
    }
    if (arg === '--max-iterations') {
      const value = args[i + 1]
      if (!value)
        return { ok: false, error: '--max-iterations requires a value' }
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed < 1) {
        return {
          ok: false,
          error: '--max-iterations must be a positive number',
        }
      }
      maxIterations = Math.floor(parsed)
      i += 1
      continue
    }
    if (arg.startsWith('--'))
      return { ok: false, error: `Unknown option: ${arg}` }
    positionals.push(arg)
  }

  let message = messageFlag
  if (positionals.length > 0) {
    const joined = positionals.join(' ')
    message = message ? `${message} ${joined}` : joined
  }

  if (!message) {
    return {
      ok: false,
      error: '--message is required (or pass a positional message)',
    }
  }

  const value: AskArgs = {
    sessionKey: sessionKey ?? DEFAULT_SESSION_KEY,
    message,
  }

  if (resume !== undefined) value.resume = resume
  if (verifyCommand !== undefined) value.verifyCommand = verifyCommand
  if (maxIterations !== undefined) value.maxIterations = maxIterations

  return { ok: true, value }
}
