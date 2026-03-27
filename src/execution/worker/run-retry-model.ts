import { runWorker } from './profiled-runner.js'

import type { TaskFocusBrief } from '../../foundation/prompting/format-task-focus-brief.js'
import type { Task, TokenUsage } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type WorkerLlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
  traceRef?: string
}

const buildTaskFocusBrief = (
  runtime: WorkerRuntime,
  task: Task,
): TaskFocusBrief | undefined => {
  const focusMeta = runtime.focuses.find((focus) => focus.id === task.focusId)
  if (!focusMeta) return undefined
  return {
    focusId: task.focusId,
    ...(focusMeta.title ? { title: focusMeta.title } : {}),
    ...(focusMeta.summary ? { summary: focusMeta.summary } : {}),
    ...(focusMeta.openItems ? { openItems: focusMeta.openItems } : {}),
    ...(focusMeta.updatedAt ? { updatedAt: focusMeta.updatedAt } : {}),
    ...(focusMeta.lastActivityAt
      ? { lastActivityAt: focusMeta.lastActivityAt }
      : {}),
  }
}

export const runTaskModel = (params: {
  runtime: WorkerRuntime
  task: Task
  controller: AbortController
  sessionId?: string
  resumeInstruction?: string
  onSessionId?: (sessionId: string) => Promise<void>
  onTurnStarted?: () => void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}): Promise<WorkerLlmResult> => {
  const { worker, codex } = params.runtime.config
  const providerConfig = {
    enabled: codex.enabled,
    model: codex.model,
    proxy: codex.proxy,
    modelReasoningEffort: codex.modelReasoningEffort,
  }
  if (!providerConfig.enabled) {
    throw new Error(
      '[worker] codex provider is disabled: set codex.enabled=true',
    )
  }

  const focusBrief = buildTaskFocusBrief(params.runtime, params.task)
  return runWorker({
    runtimeId: params.runtime.runtimeId,
    stateDir: params.runtime.config.workDir,
    cwd: params.task.cwd,
    task: params.task,
    ...(focusBrief ? { focusBrief } : {}),
    timeoutMs: worker.timeoutMs,
    ...(providerConfig.proxy ? { proxy: providerConfig.proxy } : {}),
    model: providerConfig.model,
    modelReasoningEffort: providerConfig.modelReasoningEffort,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.resumeInstruction
      ? { resumeInstruction: params.resumeInstruction }
      : {}),
    abortSignal: params.controller.signal,
    ...(params.onSessionId ? { onSessionId: params.onSessionId } : {}),
    ...(params.onTurnStarted ? { onTurnStarted: params.onTurnStarted } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.onPartialOutput
      ? { onPartialOutput: params.onPartialOutput }
      : {}),
  })
}
