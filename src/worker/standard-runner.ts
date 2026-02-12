import { listInvokableActionNames } from '../actions/registry/index.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/run.js'
import {
  loadTaskCheckpoint,
  saveTaskCheckpoint,
} from '../storage/task-checkpoint.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { handleStandardFinalOutput } from './standard-final.js'
import {
  initialStandardState,
  normalizeStandardState,
} from './standard-state.js'
import { executeStandardStep } from './standard-step-exec.js'
import { parseStandardStep } from './standard-step.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const maxRepairAttempts = 1

export const runStandardWorker = async (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const startedAt = Date.now()
  const maxRounds = Math.max(
    1,
    Math.floor(Math.max(1, params.timeoutMs) / 1_000),
  )
  const actions = listInvokableActionNames()
  const recovered = await loadTaskCheckpoint(params.stateDir, params.task.id)
  const state = recovered
    ? normalizeStandardState(recovered.state)
    : initialStandardState()
  const checkpointRecovered = Boolean(recovered)

  const saveCheckpoint = (stage: 'running' | 'finalized') =>
    saveTaskCheckpoint({
      stateDir: params.stateDir,
      checkpoint: {
        taskId: params.task.id,
        stage,
        updatedAt: new Date().toISOString(),
        state,
      },
    })

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    type: checkpointRecovered ? 'standard_resume' : 'standard_start',
    payload: {
      round: state.round,
      actions,
    },
  })

  let usageInput = 0
  let usageOutput = 0

  while (!state.finalized) {
    if (params.abortSignal?.aborted) throw new Error('standard_aborted')
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > params.timeoutMs) throw new Error('standard_timeout')
    const remainingMs = Math.max(1, params.timeoutMs - elapsedMs)
    if (state.round >= maxRounds)
      throw new Error('standard_max_rounds_exceeded')

    const plannerPrompt = await buildWorkerPrompt({
      workDir: params.workDir,
      task: params.task,
      context: {
        checkpointRecovered,
        actions,
        transcript: state.transcript,
      },
    })
    const planner = await runWithProvider({
      provider: 'openai-chat',
      prompt: plannerPrompt,
      timeoutMs: remainingMs,
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    usageInput += planner.usage?.input ?? 0
    usageOutput += planner.usage?.output ?? 0

    const step = parseStandardStep(planner.output)
    state.round += 1
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.task.id,
      type: 'standard_round',
      payload: {
        round: state.round,
        kind: step.kind === 'final' ? 'final' : 'action',
        ...(step.kind === 'actions'
          ? { actionCount: step.actionCalls.length }
          : {}),
      },
    })

    if (step.kind === 'final') {
      const decision = await handleStandardFinalOutput({
        stateDir: params.stateDir,
        taskId: params.task.id,
        round: state.round,
        rawOutput: step.output,
        evidenceRefs: new Set(state.evidenceRefs),
        repairAttempts: state.repairAttempts,
        maxRepairAttempts,
      })
      if (decision.kind === 'failed') throw new Error(decision.error)
      if (decision.kind === 'retry') {
        state.repairAttempts = decision.repairAttempts
        state.transcript.push(
          [`round: ${state.round}`, decision.hint].join('\n'),
        )
        await saveCheckpoint('running')
        continue
      }

      state.finalized = true
      state.finalOutput = decision.output
      state.transcript.push(
        [`round: ${state.round}`, `final_response:\n${decision.output}`].join(
          '\n',
        ),
      )
      await saveCheckpoint('finalized')
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.task.id,
        type: 'standard_done',
        payload: {
          round: state.round,
          repairAttempts: state.repairAttempts,
          blockerCount: decision.blockerCount,
        },
      })
      break
    }

    const actionCount = step.actionCalls.length
    for (let index = 0; index < actionCount; index += 1) {
      if (params.abortSignal?.aborted) throw new Error('standard_aborted')
      if (Date.now() - startedAt > params.timeoutMs)
        throw new Error('standard_timeout')
      const actionCall = step.actionCalls[index]
      if (!actionCall) throw new Error('standard_action_missing')
      const actionResult = await executeStandardStep({
        stateDir: params.stateDir,
        taskId: params.task.id,
        workDir: params.workDir,
        round: state.round,
        actionCall,
        actionIndex: index + 1,
        actionCount,
      })
      state.transcript.push(actionResult.transcriptEntry)
      if (!state.evidenceRefs.includes(actionResult.record.evidenceRef))
        state.evidenceRefs.push(actionResult.record.evidenceRef)
      await saveCheckpoint('running')
    }
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt)
  const total = usageInput + usageOutput
  return {
    output: state.finalOutput,
    elapsedMs,
    ...(total > 0
      ? {
          usage: {
            input: usageInput,
            output: usageOutput,
            total,
          },
        }
      : {}),
  }
}
