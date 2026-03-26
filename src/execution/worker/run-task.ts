import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskSucceeded,
} from '../../work/orchestrator/task-lifecycle.js'
import { updateTaskUsage } from '../../work/orchestrator/task-worker-run-write.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import { setTaskLiveOutput } from './live-output.js'
import { buildResult } from './result-build.js'
import { finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'

import type { Task } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const runTask = async (
  runtime: WorkerRuntime,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  const resumeInstruction = task.resumeInstruction?.trim() ?? undefined
  const resumeTurnState = { started: false }
  const clearConsumedResumeInstruction = (): void => {
    if (!resumeInstruction) return
    if (task.resumeInstruction?.trim() !== resumeInstruction) return
    delete task.resumeInstruction
  }
  try {
    const spec = await readTaskExecutionSpec(
      runtime.config.workDir,
      task.executionSpecId,
    )
    await appendLog(runtime.paths.log, {
      event: 'worker_start',
      taskId: task.id,
      profile: task.profile,
      promptChars: spec.prompt.length,
    })
    const llmResult = await runTaskWithRetry({
      runtime,
      task,
      controller,
      onUsage: (usage) => {
        updateTaskUsage(runtime, task, usage)
      },
      onPartialOutput: (output) => {
        if (!setTaskLiveOutput(runtime, task.id, output)) return
        notifyUiSignal(runtime, 'tasks')
      },
      onTurnStarted: () => {
        resumeTurnState.started = true
      },
    })
    clearConsumedResumeInstruction()
    if (task.status === 'paused') return
    if (task.status === 'canceled') {
      const usage = llmResult.usage ?? task.usage
      const result = buildResult(
        task,
        'canceled',
        'Task canceled',
        elapsed(),
        usage,
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    const result = buildResult(
      task,
      'succeeded',
      llmResult.output,
      elapsed(),
      llmResult.usage,
    )
    await finalizeResult(runtime, task, result, markTaskSucceeded)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (task.status === 'paused') {
      if (resumeTurnState.started) clearConsumedResumeInstruction()
      return
    }
    if (task.status === 'canceled') {
      clearConsumedResumeInstruction()
      const { usage } = task
      const result = buildResult(
        task,
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
        usage,
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    if (resumeTurnState.started) clearConsumedResumeInstruction()
    const result = buildResult(
      task,
      'failed',
      err.message,
      elapsed(),
      task.usage,
    )
    await finalizeResult(runtime, task, result, markTaskFailed)
  }
}
