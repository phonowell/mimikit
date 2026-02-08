import { runApiRunner } from '../llm/api-runner.js'
import { buildWorkerStandardPlannerPrompt } from '../prompts/build-prompts.js'
import {
  loadTaskCheckpoint,
  saveTaskCheckpoint,
} from '../storage/task-checkpoint.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { parseStep } from './standard-runner-step.js'
import { executeToolStep } from './standard-runner-toolcall.js'
import { listWorkerTools } from './tools/registry.js'

import type { StandardToolStep } from './standard-runner-toolcall.js'
import type { TokenUsage } from '../types/index.js'
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
  taskId: string
  prompt: string
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
  const tools = listWorkerTools()
  const recovered = await loadTaskCheckpoint(params.stateDir, params.taskId)
  const state = normalizeState(recovered?.state)
  const checkpointRecovered = Boolean(recovered)
  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: checkpointRecovered ? 'standard_resume' : 'standard_start',
    payload: {
      round: state.round,
      tools,
    },
  })

  let usageInput = 0
  let usageOutput = 0

  while (!state.finalized) {
    if (params.abortSignal?.aborted) throw new Error('standard_aborted')
    if (Date.now() - startedAt > params.timeoutMs)
      throw new Error('standard_timeout')
    if (state.round >= maxRounds)
      throw new Error('standard_max_rounds_exceeded')
    const plannerPrompt = await buildWorkerStandardPlannerPrompt({
      workDir: params.workDir,
      taskPrompt: params.prompt,
      transcript: state.transcript,
      tools,
      checkpointRecovered,
    })
    const planner = await runApiRunner({
      prompt: plannerPrompt,
      timeoutMs: Math.max(5_000, Math.min(30_000, params.timeoutMs)),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    usageInput += planner.usage?.input ?? 0
    usageOutput += planner.usage?.output ?? 0
    const step = parseStep(planner.output)
    state.round += 1
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.taskId,
      type: 'standard_round',
      payload: {
        round: state.round,
        action: step.action,
      },
    })

    if (step.action === 'respond') {
      const response =
        typeof step.response === 'string' ? step.response.trim() : ''
      if (!response) throw new Error('standard_response_empty')
      state.finalized = true
      state.finalOutput = response
      state.transcript.push(
        [`round: ${state.round}`, `final_response:\n${response}`].join('\n'),
      )
      await saveTaskCheckpoint({
        stateDir: params.stateDir,
        checkpoint: {
          taskId: params.taskId,
          stage: 'responded',
          updatedAt: new Date().toISOString(),
          state,
        },
      })
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.taskId,
        type: 'standard_done',
        payload: {
          round: state.round,
        },
      })
      break
    }

    const toolStep = step as StandardToolStep
    const toolCall = await executeToolStep({
      stateDir: params.stateDir,
      taskId: params.taskId,
      workDir: params.workDir,
      round: state.round,
      step: toolStep,
    })
    state.transcript.push(toolCall.transcriptEntry)
    await saveTaskCheckpoint({
      stateDir: params.stateDir,
      checkpoint: {
        taskId: params.taskId,
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
