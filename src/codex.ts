import { parseJsonlOutput } from './codex/jsonl.js'
import { spawnCodex } from './codex/spawn.js'

import type { TokenUsage } from './types/usage.js'

export type CodexOptions = {
  prompt: string
  workDir: string
  model?: string | undefined
  timeout: number
  allowShell?: boolean
}

export type CodexResult = {
  output: string
  usage?: TokenUsage
}

export const execCodex = (options: CodexOptions): Promise<CodexResult> =>
  new Promise((resolve, reject) => {
    const args: string[] = ['exec']

    // Always start new session
    const allowShell = options.allowShell ?? true
    if (allowShell)
      args.push('--dangerously-bypass-approvals-and-sandbox', '--json')
    else
      args.push('--disable', 'shell_tool', '--sandbox', 'read-only', '--json')

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
        let lastActivity = Date.now()
        const touch = () => {
          lastActivity = Date.now()
        }
        const timeoutId =
          timeoutMs > 0
            ? setInterval(
                () => {
                  if (Date.now() - lastActivity > timeoutMs) {
                    timedOut = true
                    proc.kill()
                  }
                },
                Math.min(1000, Math.max(250, Math.floor(timeoutMs / 4))),
              )
            : undefined

        const finish = (fn: () => void) => {
          if (finished) return
          finished = true
          if (timeoutId) clearInterval(timeoutId)
          fn()
        }

        if (proc.stdout) {
          proc.stdout.on('data', (data) => {
            stdout += data.toString()
            touch()
          })
        }
        if (proc.stderr) {
          proc.stderr.on('data', (data) => {
            stderr += data.toString()
            touch()
          })
        }

        if (proc.stdin) {
          proc.stdin.write(options.prompt)
          proc.stdin.end()
        }
        touch()

        proc.on('close', (code) => {
          finish(() => {
            if (timedOut) {
              reject(new Error(`codex idle timeout after ${timeoutMs}ms`))
              return
            }
            if (code !== 0) {
              reject(new Error(`codex exited with code ${code}: ${stderr}`))
              return
            }
            const { lastMessage, usage } = parseJsonlOutput(stdout)
            const result: CodexResult = { output: lastMessage }
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
