import { runTask, type TaskConfig } from './task.js'

import type { Protocol } from './protocol.js'

export const processPendingTasks = async (params: {
  protocol: Protocol
  taskConfig: TaskConfig
  activeTasks: Set<string>
  maxConcurrentTasks: number
}): Promise<void> => {
  const pending = await params.protocol.claimPendingTasks()
  if (pending.length === 0) return

  for (const task of pending) {
    if (params.activeTasks.size >= params.maxConcurrentTasks) {
      await params.protocol.returnPendingTask(task)
      continue
    }

    params.activeTasks.add(task.id)

    void (async () => {
      try {
        await runTask(params.taskConfig, params.protocol, task)
      } finally {
        params.activeTasks.delete(task.id)
        await params.protocol.clearInflightTask(task.id)
      }
    })()
  }
}
