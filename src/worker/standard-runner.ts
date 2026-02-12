import { listInvokableActionNames } from '../actions/registry/index.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/run.js'
import {
  loadTaskCheckpoint,
  saveTaskCheckpoint,
} from '../storage/task-checkpoint.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { executeStandardStep } from './standard-step-exec.js'
import { parseStandardStep } from './standard-step.js'

import type { StandardActionStep } from './standard-step-exec.js'
import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type StandardState = {
  round: number
  transcript: string[]
  finalized: boolean
  finalOutput: string
}

const initialState = (): StandardState => ({
  round: 0,
  transcript: [],
  finalized: false,
  finalOutput: '',
})

const normalizeState = (raw: unknown): StandardState => {
  if (!raw || typeof raw !== 'object') return initialState()
  const record = raw as Partial<StandardState>
  return {
    round:
      typeof record.round === 'number' && record.round >= 0
        ? Math.floor(record.round)
        : 0,
    transcript: Array.isArray(record.transcript)
      ? record.transcript.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    finalized: record.finalized === true,
    finalOutput:
      typeof record.finalOutput === 'string' ? record.finalOutput : '',
  }
}

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
  const state = normalizeState(recovered?.state)
  const checkpointRecovered = Boolean(recovered)
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
        kind: step.kind,
      },
    })

    if (step.kind === 'final') {
      state.finalized = true
      state.finalOutput = step.output
      state.transcript.push(
        [`round: ${state.round}`, `final_response:\n${step.output}`].join('\n'),
      )
      await saveTaskCheckpoint({
        stateDir: params.stateDir,
        checkpoint: {
          taskId: params.task.id,
          stage: 'finalized',
          updatedAt: new Date().toISOString(),
          state,
        },
      })
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.task.id,
        type: 'standard_done',
        payload: {
          round: state.round,
        },
      })
      break
    }

    const actionStep = step as StandardActionStep
    const actionCall = await executeStandardStep({
      stateDir: params.stateDir,
      taskId: params.task.id,
      workDir: params.workDir,
      round: state.round,
      step: actionStep,
    })
    state.transcript.push(actionCall.transcriptEntry)
    await saveTaskCheckpoint({
      stateDir: params.stateDir,
      checkpoint: {
        taskId: params.task.id,
        stage: 'running',
        updatedAt: new Date().toISOString(),
        state,
      },
    })
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
