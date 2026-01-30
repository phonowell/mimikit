import { spawn } from 'node:child_process'

import { resolveCodexTargets, type SpawnTarget } from './resolve.js'

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

export const spawnCodex = async (
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
