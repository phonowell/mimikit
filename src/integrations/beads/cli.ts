import { spawn } from 'node:child_process'

import type { BeadsConfig } from './types.js'

type ExecResult = { stdout: string; stderr: string }

const runCommand = (
  bin: string,
  args: string[],
  cwd: string,
): Promise<ExecResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else {
        reject(
          new Error(
            stderr.trim() || `beads command failed with exit code ${code}`,
          ),
        )
      }
    })
  })

export const runBeadsJson = async (
  config: BeadsConfig,
  args: string[],
): Promise<unknown> => {
  const baseArgs = config.noDaemon ? ['--no-daemon'] : []
  const fullArgs = [...baseArgs, ...config.extraArgs, ...args, '--json']
  const { stdout } = await runCommand(config.bin, fullArgs, config.workDir)
  const trimmed = stdout.trim()
  if (!trimmed) return undefined
  return JSON.parse(trimmed) as unknown
}
