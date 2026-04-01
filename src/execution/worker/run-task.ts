import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskSucceeded,
} from '../../work/orchestrator/task-lifecycle.js'
import { updateTaskUsage } from '../../work/orchestrator/task-worker-run-write.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import { setTaskLiveOutput } from './live-output.js'
import { finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'
import {
  buildTaskRunResult,
  resolveQueueWaitMs,
  resolveTaskRunErrorDiagnostics,
} from './run-task-results.js'
import { createTaskProgressWriteQueue } from './task-progress-write.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const runTask = async (
  runtime: WorkerRuntime,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  const progressWrites = createTaskProgressWriteQueue({
    stateDir: runtime.config.workDir,
    taskId: task.id,
  })
  const resumeInstruction = task.resumeInstruction?.trim() ?? undefined
  const resumeTurnState = { started: false }
  const clearConsumedResumeInstruction = (): void => {
    if (!resumeInstruction) return
    if (task.resumeInstruction?.trim() !== resumeInstruction) return
    delete task.resumeInstruction
  }
  const finalizeTaskResult = async (
    result: TaskResult,
    markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
  ): Promise<void> => {
    const finalizeStartedAt = Date.now()
    await finalizeResult(runtime, task, result, markFn)
    await bestEffort('appendLog: worker_finalize', () =>
      appendLog(runtime.paths.log, {
        event: 'worker_finalize',
        taskId: task.id,
        status: result.status,
        elapsedMs: Math.max(0, Date.now() - finalizeStartedAt),
        totalElapsedMs: elapsed(),
      }),
    )
  }
  try {
    const spec = await readTaskExecutionSpec(
      runtime.config.workDir,
      task.executionSpecId,
    )
    const queueWaitMs = resolveQueueWaitMs(task, startedAt)
    await appendLog(runtime.paths.log, {
      event: 'worker_start',
      taskId: task.id,
      profile: task.profile,
      promptChars: spec.prompt.length,
      ...(queueWaitMs !== undefined ? { queueWaitMs } : {}),
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
        progressWrites.pushLiveOutput(output)
        notifyUiSignal(runtime, 'tasks')
      },
      onTurnStarted: () => {
        resumeTurnState.started = true
      },
    })
    await progressWrites.flush()
    clearConsumedResumeInstruction()
    if (task.status === 'paused') return
    if (task.status === 'canceled') {
      const usage = llmResult.usage ?? task.usage
      await finalizeTaskResult(
        buildTaskRunResult(
          task,
          'canceled',
          'Task canceled',
          elapsed(),
          usage,
          llmResult.traceRef,
          undefined,
          {
            ...(llmResult.providerCallId
              ? { providerCallId: llmResult.providerCallId }
              : {}),
            ...(typeof llmResult.attempt === 'number'
              ? { attempt: llmResult.attempt }
              : {}),
          },
        ),
        markTaskCanceled,
      )
      return
    }
    const result = buildTaskRunResult(
      task,
      'succeeded',
      llmResult.output,
      elapsed(),
      llmResult.usage,
      llmResult.traceRef,
      llmResult.handoff,
      {
        ...(llmResult.providerCallId
          ? { providerCallId: llmResult.providerCallId }
          : {}),
        ...(typeof llmResult.attempt === 'number'
          ? { attempt: llmResult.attempt }
          : {}),
      },
    )
    await finalizeTaskResult(result, markTaskSucceeded)
  } catch (error) {
    await progressWrites.flush()
    const err = error instanceof Error ? error : new Error(String(error))
    if (task.status === 'paused') {
      if (resumeTurnState.started) clearConsumedResumeInstruction()
      return
    }
    if (task.status === 'canceled') {
      clearConsumedResumeInstruction()
      const { usage } = task
      const diagnostics = resolveTaskRunErrorDiagnostics(task, error)
      const result = buildTaskRunResult(
        task,
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
        usage,
        diagnostics.traceRef,
        undefined,
        {
          ...(diagnostics.providerCallId
            ? { providerCallId: diagnostics.providerCallId }
            : {}),
          ...(typeof diagnostics.attempt === 'number'
            ? { attempt: diagnostics.attempt }
            : {}),
        },
      )
      await finalizeTaskResult(result, markTaskCanceled)
      return
    }
    if (resumeTurnState.started) clearConsumedResumeInstruction()
    const diagnostics = resolveTaskRunErrorDiagnostics(task, error)
    const result = buildTaskRunResult(
      task,
      'failed',
      err.message,
      elapsed(),
      task.usage,
      diagnostics.traceRef,
      undefined,
      {
        ...(diagnostics.providerCallId
          ? { providerCallId: diagnostics.providerCallId }
          : {}),
        ...(typeof diagnostics.attempt === 'number'
          ? { attempt: diagnostics.attempt }
          : {}),
      },
    )
    await finalizeTaskResult(result, markTaskFailed)
  }
}
