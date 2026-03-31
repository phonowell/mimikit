import { bestEffort } from '../../persistence/log/safe.js'
import {
  appendTaskProgress,
  TASK_PROGRESS_WORKER_LIVE_OUTPUT_TYPE,
} from '../../persistence/storage/task-progress.js'

export const createTaskProgressWriteQueue = (params: {
  stateDir: string
  taskId: string
}) => {
  const pendingWrites: Promise<unknown>[] = []

  return {
    pushLiveOutput(output: string): void {
      pendingWrites.push(
        bestEffort('appendTaskProgress: worker_activity', () =>
          appendTaskProgress({
            stateDir: params.stateDir,
            taskId: params.taskId,
            type: 'worker_activity',
            payload: { text: output },
          }),
        ),
      )
      pendingWrites.push(
        bestEffort(
          `appendTaskProgress: ${TASK_PROGRESS_WORKER_LIVE_OUTPUT_TYPE}`,
          () =>
            appendTaskProgress({
              stateDir: params.stateDir,
              taskId: params.taskId,
              type: TASK_PROGRESS_WORKER_LIVE_OUTPUT_TYPE,
              payload: { text: output },
            }),
        ),
      )
    },
    async flush(): Promise<void> {
      if (pendingWrites.length === 0) return
      await Promise.allSettled(pendingWrites.splice(0))
    },
  }
}
