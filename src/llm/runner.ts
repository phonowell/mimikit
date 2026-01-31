import { execCodex } from '../codex.js'

export type RunOptions = {
  prompt: string
  workDir: string
  model?: string
  timeoutMs: number
  allowShell: boolean
}

export const runCodex = async (options: RunOptions): Promise<string> => {
  const result = await execCodex({
    prompt: options.prompt,
    workDir: options.workDir,
    model: options.model,
    timeout: options.timeoutMs,
    allowShell: options.allowShell,
  })
  return result.output
}
