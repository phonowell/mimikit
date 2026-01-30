import { parseJsonlOutput } from './codex/jsonl.js'
import { spawnCodex } from './codex/spawn.js'

import type { TokenUsage } from './protocol.js'

export type CodexOptions = {
  prompt: string
  workDir: string
  model?: string | undefined
  timeout: number
}

export type CodexResult = {
  output: string
  usage?: TokenUsage
}

export const execCodex = (options: CodexOptions): Promise<CodexResult> =>
  new Promise((resolve, reject) => {
    const args: string[] = ['exec']

    // Always start new session

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
