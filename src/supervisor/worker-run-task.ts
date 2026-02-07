import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { runWorker } from '../roles/worker-runner.js'
import { sleep } from '../shared/utils.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskSucceeded,
} from '../tasks/queue.js'

import { persistRuntimeState } from './runtime-persist.js'
import { appendRuntimeIssue } from './worker-feedback.js'
import { buildResult, finalizeResult } from './worker-result.js'

import type { RuntimeState } from './runtime.js'
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
      promptChars: task.prompt.length,
    })
    let llmResult: Awaited<ReturnType<typeof runWorker>> | null = null
    const maxAttempts = Math.max(0, runtime.config.worker.retryMaxAttempts)
    const backoffMs = Math.max(0, runtime.config.worker.retryBackoffMs)
    let attempt = 0
    while (attempt <= maxAttempts) {
      try {
        llmResult = await runWorker({
          stateDir: runtime.config.stateDir,
          workDir: runtime.config.workDir,
          task,
          timeoutMs: runtime.config.worker.timeoutMs,
          model: runtime.config.worker.model,
          modelReasoningEffort: runtime.config.worker.modelReasoningEffort,
          abortSignal: controller.signal,
        })
        break
      } catch (error) {
        await bestEffort('appendEvolveFeedback: worker_retry', () =>
          appendRuntimeIssue({
            runtime,
            severity: 'medium',
            category: 'failure',
            message: `worker retry: ${
              error instanceof Error ? error.message : String(error)
            }`,
            note: 'worker_retry',
            task,
            confidence: 0.75,
            roiScore: 64,
            action: 'fix',
          }),
        )
        if (attempt >= maxAttempts) throw error
        await appendLog(runtime.paths.log, {
          event: 'worker_retry',
          taskId: task.id,
          attempt: attempt + 1,
          maxAttempts,
          backoffMs,
        })
        attempt += 1
        task.attempts = Math.max(0, (task.attempts ?? 0) + 1)
        await bestEffort('persistRuntimeState: worker_retry', () =>
          persistRuntimeState(runtime),
        )
        await sleep(backoffMs)
      }
    }
    if (!llmResult) throw new Error('worker_result_missing')
    const usageTotal = llmResult.usage?.total ?? 0
    const elapsedMs = elapsed()
    if (elapsedMs >= runtime.config.evolve.runtimeHighLatencyMs) {
      await bestEffort('appendEvolveFeedback: worker_high_latency', () =>
        appendRuntimeIssue({
          runtime,
          severity:
            elapsedMs >= runtime.config.evolve.runtimeHighLatencyMs * 2
              ? 'high'
              : 'medium',
          category: 'latency',
          message: `worker high latency: ${elapsedMs}ms`,
          note: 'worker_high_latency',
          task,
          elapsedMs,
          usageTotal,
          confidence: 0.85,
          roiScore:
            elapsedMs >= runtime.config.evolve.runtimeHighLatencyMs * 2
              ? 85
              : 68,
          action: 'fix',
        }),
      )
    }
    if (usageTotal >= runtime.config.evolve.runtimeHighUsageTotal) {
      await bestEffort('appendEvolveFeedback: worker_high_usage', () =>
        appendRuntimeIssue({
          runtime,
          severity:
            usageTotal >= runtime.config.evolve.runtimeHighUsageTotal * 2
              ? 'high'
              : 'medium',
          category: 'cost',
          message: `worker high usage: ${usageTotal} tokens`,
          note: 'worker_high_usage',
          task,
          elapsedMs,
          usageTotal,
          confidence: 0.85,
          roiScore:
            usageTotal >= runtime.config.evolve.runtimeHighUsageTotal * 2
              ? 87
              : 70,
          action: 'fix',
        }),
      )
    }
    if (task.status === 'canceled') {
      const result = buildResult(
        task,
        'canceled',
        'Task canceled',
        elapsed(),
        llmResult.usage,
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
    if (task.status === 'canceled') {
      const result = buildResult(
        task,
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    const result = buildResult(task, 'failed', err.message, elapsed())
    await bestEffort('appendEvolveFeedback: worker_failed', () =>
      appendRuntimeIssue({
        runtime,
        severity: 'high',
        category: 'failure',
        message: `worker failed: ${err.message}`,
        note: 'worker_failed',
        task,
        confidence: 0.95,
        roiScore: 92,
        action: 'fix',
      }),
    )
    await finalizeResult(runtime, task, result, markTaskFailed)
  }
}
