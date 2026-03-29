import { buildPaths } from '../../persistence/fs/paths.js'
import { appendTaskProgress } from '../../persistence/storage/task-progress.js'
import { buildWorkerPrompt } from '../../policy/prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'

import { runWorkerLoop } from './profiled-runner-loop.js'
import { buildWorkerTurnOutputSchema } from './worker-turn.js'

import type { TaskFocusBrief } from '../../foundation/prompting/format-task-focus-brief.js'
import type {
  Task,
  TaskResultHandoff,
  TokenUsage,
} from '../../foundation/types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = {
  output: string
  handoff: TaskResultHandoff
  elapsedMs: number
  usage?: TokenUsage
  traceRef?: string
}

type BuildRunModelParams = {
  runtimeId: string
  stateDir: string
  cwd: string
  task: Task
  timeoutMs: number
  proxy?: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}

const buildWorkerLogContext = (
  params: BuildRunModelParams,
): Record<string, unknown> => ({
  event: 'llm_call',
  role: 'worker',
  taskId: params.task.id,
  focusId: params.task.focusId,
  executionSpecId: params.task.executionSpecId,
  taskProfile: params.task.profile,
})

const buildRunModel =
  (params: BuildRunModelParams) =>
  (input: {
    prompt: string
    threadId?: string | null
    onTurnStarted?: () => void
    onUsage?: (usage: TokenUsage) => void
    onPartialOutput?: (output: string) => void
  }) =>
    runWithProvider({
      provider: 'codex-sdk',
      role: 'worker',
      prompt: input.prompt,
      runtimeId: params.runtimeId,
      workDir: params.cwd,
      timeoutMs: params.timeoutMs,
      logPath: buildPaths(params.stateDir).log,
      logContext: buildWorkerLogContext(params),
      ...(params.proxy ? { proxy: params.proxy } : {}),
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      outputSchema: buildWorkerTurnOutputSchema(),
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.onTurnStarted ? { onTurnStarted: input.onTurnStarted } : {}),
      ...(input.onUsage ? { onUsage: input.onUsage } : {}),
      ...(input.onPartialOutput
        ? { onPartialOutput: input.onPartialOutput }
        : {}),
    })

type WorkerRunnerParams = {
  runtimeId: string
  stateDir: string
  cwd: string
  task: Task
  sessionId?: string
  resumeInstruction?: string
  focusBrief?: TaskFocusBrief
  timeoutMs: number
  proxy?: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onSessionId?: (sessionId: string) => Promise<void> | void
  onTurnStarted?: () => void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}

export const runWorker = async (
  params: WorkerRunnerParams,
): Promise<LlmResult> => {
  const prompt = await buildWorkerPrompt({
    stateDir: params.stateDir,
    workspaceDir: params.cwd,
    task: params.task,
    ...(params.resumeInstruction
      ? { resumeInstruction: params.resumeInstruction }
      : {}),
    ...(params.focusBrief ? { focusBrief: params.focusBrief } : {}),
  })

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    type: 'worker_start',
  })

  return runWorkerLoop({
    stateDir: params.stateDir,
    task: params.task,
    prompt,
    ...(params.sessionId ? { initialThreadId: params.sessionId } : {}),
    archiveBase: {
      role: 'worker' as const,
      taskId: params.task.id,
      ...(params.model ? { model: params.model } : {}),
    },
    runModel: buildRunModel(params),
    ...(params.onSessionId ? { onSessionId: params.onSessionId } : {}),
    ...(params.onTurnStarted ? { onTurnStarted: params.onTurnStarted } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.onPartialOutput
      ? { onPartialOutput: params.onPartialOutput }
      : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
  })
}
