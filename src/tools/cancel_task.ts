import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'
import { removeItem } from '../storage/queue.js'
import { removeTrigger } from '../storage/triggers.js'

import type { ToolContext } from './context.js'

export type CancelTaskArgs = { id: string }

const exists = async (path: string): Promise<boolean> => {
  try {
    await import('node:fs/promises').then((fs) => fs.stat(path))
    return true
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return false
    await logSafeError('cancelTask: stat', error, { meta: { path } })
    throw error
  }
}

export const cancelTask = async (ctx: ToolContext, args: CancelTaskArgs) => {
  const { id } = args
  const plannerQueue = join(ctx.paths.plannerQueue, `${id}.json`)
  const workerQueue = join(ctx.paths.workerQueue, `${id}.json`)
  const trigger = join(ctx.paths.triggers, `${id}.json`)

  if (await exists(plannerQueue)) {
    await removeItem(plannerQueue)
    return { success: true }
  }
  if (await exists(workerQueue)) {
    await removeItem(workerQueue)
    return { success: true }
  }
  if (await exists(trigger)) {
    await removeTrigger(ctx.paths.triggers, id)
    return { success: true }
  }
  return { success: false }
}
