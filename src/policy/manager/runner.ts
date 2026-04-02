import { buildPaths } from '../../persistence/fs/paths.js'
import { buildManagerPromptPayload } from '../prompts/build-prompts.js'

import { runManagerLlmCall } from './manager-llm-call.js'
import {
  buildManagerTurnOutputSchema,
  parseManagerTurn,
} from './manager-turn.js'
import {
  archiveManagerTrace,
  attachManagerErrorDiagnostics,
  readManagerErrorDiagnostics,
  toManagerTraceRef,
} from './runner-trace.js'
import {
  type ManagerRetryPolicy,
  type RunManagerResult,
} from './runner-types.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type {
  FocusId,
  FocusMeta,
  ManagerActionFeedback,
  ManagerEnv,
  ManagerPacketMode,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: AppConfig['manager']['promptSections']
  startupWorktree?: string
  plans?: TaskPlan[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  workingFocusIds?: FocusId[]
  model?: string
  baseUrl?: string | undefined
  apiKey?: string | undefined
  proxy?: string | undefined
  threadId?: string | null
  modelReasoningEffort?: ModelReasoningEffort | undefined
  retry?: ManagerRetryPolicy
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
  usePromptSegments?: boolean
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
  batchId?: string
  roundId?: string
}): Promise<RunManagerResult> => {
  const promptPayload = await buildManagerPromptPayload({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    promptSectionLimits: params.promptSectionLimits,
    ...(params.startupWorktree
      ? { startupWorktree: params.startupWorktree }
      : {}),
    ...(params.plans ? { plans: params.plans } : {}),
    ...(params.actionFeedback ? { actionFeedback: params.actionFeedback } : {}),
    ...(params.env ? { env: params.env } : {}),
    ...(params.focuses ? { focuses: params.focuses } : {}),
    ...(params.workingFocusIds
      ? { workingFocusIds: params.workingFocusIds }
      : {}),
    ...(params.packetMode ? { packetMode: params.packetMode } : {}),
    ...(params.wakeProfile ? { wakeProfile: params.wakeProfile } : {}),
  })
  const {
    prompt,
    promptSegments,
    contextPacket,
    promptSections,
    promptSelection,
  } = promptPayload
  const paths = buildPaths(params.stateDir)

  const model = params.model?.trim()

  try {
    const result = await runManagerLlmCall({
      prompt,
      ...(params.usePromptSegments === false ? {} : { promptSegments }),
      outputSchema: buildManagerTurnOutputSchema(),
      workDir: params.workDir,
      ...(model ? { model } : {}),
      ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
      ...(params.apiKey ? { apiKey: params.apiKey } : {}),
      ...(params.proxy ? { proxy: params.proxy } : {}),
      ...(params.threadId ? { threadId: params.threadId } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(params.retry ? { retry: params.retry } : {}),
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
      logPath: paths.log,
      logContext: {
        event: 'llm_call',
        role: 'manager',
        ...(params.batchId ? { batchId: params.batchId } : {}),
        ...(params.roundId ? { roundId: params.roundId } : {}),
        promptSegmentCount:
          params.usePromptSegments === false ? 1 : promptSegments.length,
        promptSegmentCacheControl:
          params.usePromptSegments === false
            ? []
            : promptSegments.map((segment) => segment.cacheControl ?? 'none'),
      },
    })
    const tracePath = await archiveManagerTrace({
      stateDir: params.stateDir,
      prompt: result.prompt,
      ...(model ? { model } : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
      ...(result.threadId ? { threadId: result.threadId } : {}),
      result: { ...result, ok: true },
    })
    const traceRef = toManagerTraceRef(params.stateDir, tracePath)
    const turn = parseManagerTurn(result.outputJson)
    return {
      output: turn.reply,
      actions: turn.actions,
      ...(turn.decision ? { decision: turn.decision } : {}),
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.threadId ? { threadId: result.threadId } : {}),
      contextPacket,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      promptSegmentCount:
        params.usePromptSegments === false ? 1 : promptSegments.length,
      promptSections,
      promptSelection,
      ...(traceRef ? { traceRef } : {}),
      ...(result.providerCallId
        ? { providerCallId: result.providerCallId }
        : {}),
      ...(result.attempt ? { attempt: result.attempt } : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const diagnostics = readManagerErrorDiagnostics(error)
    const tracePath = await archiveManagerTrace({
      stateDir: params.stateDir,
      prompt,
      ...(model ? { model } : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
      result: {
        output: '',
        ok: false,
        error: err.message,
        errorName: err.name,
        ...(diagnostics.providerCallId
          ? { providerCallId: diagnostics.providerCallId }
          : {}),
        ...(diagnostics.attempt ? { attempt: diagnostics.attempt } : {}),
      },
      ...(diagnostics.threadId ? { threadId: diagnostics.threadId } : {}),
    })
    throw attachManagerErrorDiagnostics({
      error,
      stateDir: params.stateDir,
      tracePath,
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
    })
  }
}
