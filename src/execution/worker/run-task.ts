import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { appendTaskProgress } from '../../persistence/storage/task-progress.js'
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

import type {
  Task,
  TaskResult,
  TaskResultHandoff,
} from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const parseIsoMs = (value: string | undefined): number | undefined => {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : undefined
}

const resolveQueueWaitMs = (
  task: Task,
  fallbackStartedAtMs: number,
): number | undefined => {
  const createdAtMs = parseIsoMs(task.createdAt)
  if (createdAtMs === undefined) return undefined
  const startedAtMs = parseIsoMs(task.startedAt) ?? fallbackStartedAtMs
  return Math.max(0, startedAtMs - createdAtMs)
}

export const runTask = async (
  runtime: WorkerRuntime,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  const pendingProgressWrites: Promise<unknown>[] = []
  const resumeInstruction = task.resumeInstruction?.trim() ?? undefined
  const resumeTurnState = { started: false }
  const queueProgressWrite = (output: string): void => {
    pendingProgressWrites.push(
      bestEffort('appendTaskProgress: worker_activity', () =>
        appendTaskProgress({
          stateDir: runtime.config.workDir,
          taskId: task.id,
          type: 'worker_activity',
          payload: { text: output },
        }),
      ),
    )
  }
  const flushProgressWrites = async (): Promise<void> => {
    if (pendingProgressWrites.length === 0) return
    await Promise.allSettled(pendingProgressWrites.splice(0))
  }
  const clearConsumedResumeInstruction = (): void => {
    if (!resumeInstruction) return
    if (task.resumeInstruction?.trim() !== resumeInstruction) return
    delete task.resumeInstruction
  }
  const resolveErrorTraceRef = (error: unknown): string | undefined => {
    if ((typeof error !== 'object' && typeof error !== 'function') || !error)
      return undefined
    const value = Reflect.get(error as object, 'traceRef')
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  const buildTaskResult = (
    status: 'succeeded' | 'failed' | 'canceled',
    output: string,
    durationMs: number,
    usage?: Task['usage'],
    traceRef?: string,
    handoff?: TaskResultHandoff,
  ) =>
    traceRef
      ? buildResult(task, status, output, durationMs, usage, traceRef, handoff)
      : buildResult(task, status, output, durationMs, usage, undefined, handoff)
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
        queueProgressWrite(output)
        notifyUiSignal(runtime, 'tasks')
      },
      onTurnStarted: () => {
        resumeTurnState.started = true
      },
    })
    await flushProgressWrites()
    clearConsumedResumeInstruction()
    if (task.status === 'paused') return
    if (task.status === 'canceled') {
      const usage = llmResult.usage ?? task.usage
      await finalizeTaskResult(
        buildTaskResult(
          'canceled',
          'Task canceled',
          elapsed(),
          usage,
          llmResult.traceRef,
        ),
        markTaskCanceled,
      )
      return
    }
    const result = buildTaskResult(
      'succeeded',
      llmResult.output,
      elapsed(),
      llmResult.usage,
      llmResult.traceRef,
      llmResult.handoff,
    )
    await finalizeTaskResult(result, markTaskSucceeded)
  } catch (error) {
    await flushProgressWrites()
    const err = error instanceof Error ? error : new Error(String(error))
    if (task.status === 'paused') {
      if (resumeTurnState.started) clearConsumedResumeInstruction()
      return
    }
    if (task.status === 'canceled') {
      clearConsumedResumeInstruction()
      const { usage } = task
      const traceRef = resolveErrorTraceRef(error)
      const result = buildTaskResult(
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
        usage,
        traceRef,
      )
      await finalizeTaskResult(result, markTaskCanceled)
      return
    }
    if (resumeTurnState.started) clearConsumedResumeInstruction()
    const traceRef = resolveErrorTraceRef(error)
    const result = buildTaskResult(
      'failed',
      err.message,
      elapsed(),
      task.usage,
      traceRef,
    )
    await finalizeTaskResult(result, markTaskFailed)
  }
}
