import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskPaused,
  markTaskSucceeded,
} from '../../work/orchestrator/task-lifecycle.js'
import { requestTaskResumeChoice } from '../../work/orchestrator/task-resume-choice.js'
import { updateTaskUsage } from '../../work/orchestrator/task-worker-run-write.js'

import { setTaskLiveOutput } from './live-output.js'
import { isWorkerBudgetExceededError } from './profiled-runner-loop.js'
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
    await appendLog(runtime.paths.log, {
      event: 'worker_start',
      taskId: task.id,
      profile: task.profile,
      promptChars: task.prompt.length,
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
    if (isWorkerBudgetExceededError(error)) {
      clearConsumedResumeInstruction()
      const partialOutput = error.latestOutput.trim()
      const result = buildResult(
        task,
        'partial',
        partialOutput,
        error.elapsedMs,
        error.usage ?? task.usage,
      )
      result.handoff = {
        ...(result.handoff ?? {}),
        summary:
          partialOutput.length > 0
            ? `Task paused after hitting the run budget. ${partialOutput.split(/\r?\n/, 1)[0]?.trim() ?? ''}`.trim()
            : 'Task paused after hitting the run budget.',
        nextSteps: [
          'Review the partial result and resume the task when you want to continue.',
        ],
        risks: [
          'Task stopped at the run budget boundary and may need another resume cycle.',
        ],
      }
      await finalizeResult(runtime, task, result, markTaskPaused, {
        taskPatch: {
          pausedAt: result.completedAt,
        },
        persistCompletionFields: false,
      })
      await bestEffort('requestTaskResumeChoice: budget_pause', async () => {
        await requestTaskResumeChoice({
          runtime,
          task,
          createdAt: result.completedAt,
        })
        await persistRuntimeState(runtime)
      })
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
    const result = buildResult(task, 'failed', err.message, elapsed())
    await finalizeResult(runtime, task, result, markTaskFailed)
  }
}
