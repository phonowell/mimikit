import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  markTaskFailed,
  markTaskRunning,
  markTaskSucceeded,
} from '../orchestrator/core/task-state.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'
import {
  appendLlmArchiveResult,
  type LlmArchiveEntry,
} from '../storage/llm-archive.js'
import { buildResult, finalizeResult } from '../worker/result-finalize.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const runManagerProfileTask = async (
  runtime: RuntimeState,
  task: Task,
): Promise<void> => {
  const { task: taskConfig } = runtime.config.manager
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)

  markTaskRunning(runtime.tasks, task.id)
  await bestEffort('persistRuntimeState: manager_task_start', () =>
    persistRuntimeState(runtime),
  )

  await bestEffort('appendLog: manager_task_start', () =>
    appendLog(runtime.paths.log, {
      event: 'manager_task_start',
      taskId: task.id,
      profile: 'manager',
      promptChars: task.prompt.length,
    }),
  )

  let prompt = ''
  try {
    prompt = await buildWorkerPrompt({
      workDir: runtime.config.workDir,
      task,
    })
    const llmResult = await runWithProvider({
      provider: 'openai-chat',
      prompt,
      timeoutMs: taskConfig.timeoutMs,
      model: taskConfig.model,
      modelReasoningEffort: taskConfig.modelReasoningEffort,
    })

    if (llmResult.usage) task.usage = llmResult.usage

    const archiveBase: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'> = {
      role: 'worker',
      taskId: task.id,
      model: taskConfig.model,
    }
    await bestEffort('archive: manager_task', () =>
      appendLlmArchiveResult(runtime.config.workDir, archiveBase, prompt, {
        ...llmResult,
        ok: true,
      }),
    )

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

    if (prompt) {
      await bestEffort('archive: manager_task_error', () =>
        appendLlmArchiveResult(
          runtime.config.workDir,
          { role: 'worker', taskId: task.id, model: taskConfig.model },
          prompt,
          { output: '', ok: false, error: err.message, errorName: err.name },
        ),
      )
    }

    const result = buildResult(task, 'failed', err.message, elapsed())
    await finalizeResult(runtime, task, result, markTaskFailed)
  }

  await bestEffort('appendLog: manager_task_end', () =>
    appendLog(runtime.paths.log, {
      event: 'manager_task_end',
      taskId: task.id,
      profile: 'manager',
      status: task.status,
      elapsedMs: elapsed(),
    }),
  )
}

export const executeManagerProfileTasks = async (
  runtime: RuntimeState,
): Promise<void> => {
  const pending = runtime.tasks.filter(
    (t) => t.profile === 'manager' && t.status === 'pending',
  )
  for (const task of pending) {
    if (runtime.stopped) break
    await runManagerProfileTask(runtime, task)
  }
}
