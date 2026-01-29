import { spawn } from 'node:child_process'

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
}

export function execCodex(options: CodexOptions): Promise<CodexResult> {
  return new Promise((resolve, reject) => {
    const args: string[] = ['exec']

    // Resume existing session or start new
    if (options.sessionId) args.push('resume', options.sessionId)

    args.push('--dangerously-bypass-approvals-and-sandbox', '--json')

    if (options.model) args.push('--model', options.model)

    args.push('--', options.prompt)

    const proc = spawn('codex', args, {
      cwd: options.workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

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

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

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
        const { sessionId, lastMessage } = parseJsonlOutput(stdout)
        resolve({ output: lastMessage, sessionId })
      })
    })

    proc.on('error', (error) => {
      finish(() => reject(error))
    })
  })
}

type JsonlEvent = {
  type?: string
  thread_id?: string
  item?: { type?: string; text?: string }
  [key: string]: unknown
}

function parseJsonlOutput(output: string): {
  sessionId: string | undefined
  lastMessage: string
} {
  let sessionId: string | undefined
  let lastMessage = ''

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
    } catch {
      // skip non-JSON lines
    }
  }

  return { sessionId, lastMessage }
}
