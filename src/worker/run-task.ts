import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskPaused,
  markTaskSucceeded,
} from '../orchestrator/core/task-lifecycle.js'
import { requestTaskResumeChoice } from '../orchestrator/core/task-resume-choice.js'
import { isSameUsage } from '../shared/token-usage.js'

import { setTaskLiveOutput } from './live-output.js'
import { isWorkerBudgetExceededError } from './profiled-runner-loop.js'
import { buildResult } from './result-build.js'
import { finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

export const runTask = async (
  runtime: RuntimeState,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)
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
        if (isSameUsage(task.usage, usage)) return
        task.usage = usage
        notifyUiSignal(runtime, 'tasks')
      },
      onPartialOutput: (output) => {
        if (!setTaskLiveOutput(runtime, task.id, output)) return
        notifyUiSignal(runtime, 'tasks')
      },
    })
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
    if (task.status === 'paused') return
    if (isWorkerBudgetExceededError(error)) {
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
    const result = buildResult(task, 'failed', err.message, elapsed())
    await finalizeResult(runtime, task, result, markTaskFailed)
  }
}
